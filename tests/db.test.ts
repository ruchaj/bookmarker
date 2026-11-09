// Runs the real migration in an in-process Postgres (PGlite) with a stand-in
// for Supabase's auth schema, then checks row-level security and functions.
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildTsQuery } from "@/lib/search";

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";
let db: PGlite;

async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant usage on schema public to authenticated, anon;
    insert into auth.users values ('${ALICE}'), ('${BOB}');
  `);
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/0001_init.sql"), "utf8"));
});

describe("database", () => {
  let aliceBook = "";
  let bobBook = "";

  it("lets each user create and see only their own books", async () => {
    aliceBook = await as(ALICE, async () =>
      (await db.query<{ id: string }>("insert into books (title, total_pages) values ('The Salt Road', 300) returning id")).rows[0].id);
    bobBook = await as(BOB, async () =>
      (await db.query<{ id: string }>("insert into books (title) values ('Bob''s Book') returning id")).rows[0].id);

    const seen = await as(ALICE, async () => (await db.query<{ title: string }>("select title from books")).rows);
    expect(seen.map((r) => r.title)).toEqual(["The Salt Road"]);
  });

  it("blocks writing into someone else's book or under someone else's id", async () => {
    await expect(as(ALICE, () =>
      db.query("insert into passages (book_id, kind, content) values ($1, 'scan', 'x')", [bobBook]))).rejects.toThrow(/row-level security/);
    await expect(as(ALICE, () =>
      db.query("insert into books (title, user_id) values ('Forged', $1)", [BOB]))).rejects.toThrow(/row-level security/);
    const updated = await as(ALICE, () => db.query("update books set title = 'Hacked' where id = $1", [bobBook]));
    expect(updated.affectedRows).toBe(0);
    await expect(as(ALICE, () => db.query("select record_progress($1, 5, 'manual')", [bobBook]))).rejects.toThrow(/Book not found/);
  });

  it("records progress, clamps to the book's length and marks it finished", async () => {
    const step = (page: number) => as(ALICE, async () =>
      (await db.query<{ current_page: number; status: string; finished_at: string | null }>(
        "select current_page, status, finished_at from record_progress($1, $2, 'manual')", [aliceBook, page])).rows[0]);

    expect(await step(120)).toMatchObject({ current_page: 120, status: "reading", finished_at: null });
    const done = await step(999);
    expect(done).toMatchObject({ current_page: 300, status: "finished" });
    expect(done.finished_at).not.toBeNull();
    expect(await step(150)).toMatchObject({ current_page: 150, status: "reading", finished_at: null });

    const events = await as(ALICE, async () =>
      (await db.query<{ page: number }>("select page from progress_events where book_id = $1 order by created_at, page", [aliceBook])).rows);
    expect(events.map((e) => e.page).sort((a, b) => a - b)).toEqual([120, 150, 300]);
    await expect(step(-1)).rejects.toThrow(/negative/);
  });

  it("finds the right passage from a loose description", async () => {
    await as(ALICE, async () => {
      await db.query(
        `insert into passages (book_id, kind, idx, start_pct, end_pct, chapter, content) values
         ($1, 'text', 0, 0, 0.33, 'One', 'Mara reached the harbour at dusk. The ferry had already gone, and gulls wheeled over the empty quay.'),
         ($1, 'text', 1, 0.33, 0.66, 'Two', 'At the lighthouse she climbed the stairs and found a letter tucked under the lamp. It was addressed to her mother.'),
         ($1, 'text', 2, 0.66, 1, 'Three', 'The storm broke the next morning. Old Tom rowed out past the rocks and did not come back.')`,
        [aliceBook]);
      await db.query("insert into passages (book_id, kind, page_number, content) values ($1, 'scan', 212, 'A photographed page about the lighthouse keeper and his lamps.')", [aliceBook]);
    });
    await as(BOB, () => db.query(
      "insert into passages (book_id, kind, idx, content) values ($1, 'text', 0, 'Another lighthouse and another letter, in Bob''s book.')", [bobBook]));

    const query = buildTsQuery("they had just got to the lighthouse and she finds the letters", ["Old Tom"]);
    const hits = await as(ALICE, async () =>
      (await db.query<{ chapter: string | null; kind: string; page_number: number | null; content: string }>(
        "select chapter, kind, page_number, content from search_passages($1, $2, 20)", [aliceBook, query])).rows);

    expect(hits[0].chapter).toBe("Two");
    expect(hits.some((h) => h.kind === "scan" && h.page_number === 212)).toBe(true);
    expect(hits.some((h) => h.content.includes("Bob"))).toBe(false);

    // Alice cannot search Bob's book even by passing its id.
    const leaked = await as(ALICE, async () => (await db.query("select * from search_passages($1, $2, 20)", [bobBook, query])).rows);
    expect(leaked).toHaveLength(0);
  });

  it("counts AI requests per user and hides the counter table", async () => {
    const bump = (u: string) => as(u, async () => (await db.query<{ n: number }>("select bump_ai_usage() as n")).rows[0].n);
    expect(await bump(ALICE)).toBe(1);
    expect(await bump(ALICE)).toBe(2);
    expect(await bump(BOB)).toBe(1);
    await expect(as(ALICE, () => db.query("update ai_usage set count = 0"))).rejects.toThrow(/permission denied/);
  });

  it("removes a book's history and passages when the book is deleted", async () => {
    await as(ALICE, () => db.query("delete from books where id = $1", [aliceBook]));
    const left = await db.query<{ n: number }>(
      "select (select count(*) from passages where book_id = $1) + (select count(*) from progress_events where book_id = $1) as n", [aliceBook]);
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
