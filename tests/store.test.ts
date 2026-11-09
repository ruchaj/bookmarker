// Exercises the JSON store against a real temporary folder on disk.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chunkSections } from "@/lib/chunk";
import { buildQuery } from "@/lib/search";
import * as accounts from "@/lib/store/accounts";
import { update } from "@/lib/store/files";
import * as library from "@/lib/store/library";

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bookmarker-test-"));
  process.env.DATA_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("accounts", () => {
  it("creates accounts, rejects duplicates, and never stores the password", async () => {
    const user = await accounts.createUser("  Alice@Example.com ", "correct horse battery");
    expect(user.email).toBe("alice@example.com");
    await expect(accounts.createUser("alice@example.com", "another password")).rejects.toThrow(accounts.EmailTakenError);

    const raw = readFileSync(path.join(dir, "accounts.json"), "utf8");
    expect(raw).not.toContain("correct horse");
    expect(JSON.parse(raw).users[0].password_hash).toMatch(/^scrypt\$15\$8\$1\$/);
  });

  it("checks passwords", async () => {
    expect(await accounts.verifyLogin("ALICE@example.com", "correct horse battery")).toMatchObject({ email: "alice@example.com" });
    expect(await accounts.verifyLogin("alice@example.com", "wrong")).toBeNull();
    expect(await accounts.verifyLogin("nobody@example.com", "correct horse battery")).toBeNull();
  });

  it("runs sessions from a secret token that is stored only as a hash", async () => {
    const user = (await accounts.verifyLogin("alice@example.com", "correct horse battery"))!;
    const token = await accounts.createSession(user.id);
    expect(readFileSync(path.join(dir, "accounts.json"), "utf8")).not.toContain(token);

    expect(await accounts.findSessionUser(token)).toMatchObject({ id: user.id });
    expect(await accounts.findSessionUser(`${token}x`)).toBeNull();
    expect(await accounts.findSessionUser(undefined)).toBeNull();

    await accounts.deleteSession(token);
    expect(await accounts.findSessionUser(token)).toBeNull();
  });

  it("ignores expired sessions", async () => {
    const user = (await accounts.verifyLogin("alice@example.com", "correct horse battery"))!;
    const token = await accounts.createSession(user.id);
    await update(path.join(dir, "accounts.json"), () => ({ users: [], sessions: [] as { expires_at: string }[] }), (file) => {
      for (const s of file.sessions) s.expires_at = new Date(Date.now() - 1000).toISOString();
    });
    expect(await accounts.findSessionUser(token)).toBeNull();
  });

  it("resets a password with the command-line script and signs the account out", async () => {
    const user = (await accounts.verifyLogin("alice@example.com", "correct horse battery"))!;
    const token = await accounts.createSession(user.id);
    execFileSync("node", ["scripts/set-password.mjs", "Alice@example.com", "a brand new password"], {
      env: { ...process.env, DATA_DIR: dir },
    });
    expect(await accounts.verifyLogin("alice@example.com", "correct horse battery")).toBeNull();
    expect(await accounts.verifyLogin("alice@example.com", "a brand new password")).not.toBeNull();
    expect(await accounts.findSessionUser(token)).toBeNull();
  });
});

describe("library", () => {
  let alice = "";
  let bob = "";
  let book = "";

  beforeAll(async () => {
    alice = (await accounts.createUser("a@example.com", "password-one")).id;
    bob = (await accounts.createUser("b@example.com", "password-two")).id;
  });

  it("keeps each reader's books apart", async () => {
    book = (await library.addBook(alice, {
      title: "The Salt Road", author: "A. Writer", isbn: null, cover_url: null, total_pages: 300, status: "reading",
    })).id;
    await library.addBook(bob, { title: "Bob's Book", author: null, isbn: null, cover_url: null, total_pages: null, status: "want" });

    expect((await library.listBooks(alice)).map((b) => b.title)).toEqual(["The Salt Road"]);
    expect(await library.getBook(bob, book)).toBeNull();
    await expect(library.recordProgress(bob, book, 5, "manual")).rejects.toThrow(library.NotFoundError);
    await expect(library.updateBook(bob, book, { title: "Hacked", author: null, total_pages: 1, status: "finished" })).rejects.toThrow(library.NotFoundError);
    await expect(library.deleteBook(bob, book)).rejects.toThrow(library.NotFoundError);
    await expect(library.saveScan(bob, book, 3, [{ page_number: 3, text: "x" }])).rejects.toThrow(library.NotFoundError);
    expect((await library.getBook(alice, book))!.title).toBe("The Salt Road");
  });

  it("refuses ids that could escape the data folder", async () => {
    expect(await library.getBook(alice, "../../accounts")).toBeNull();
    await expect(library.listBooks("../../etc")).rejects.toThrow(/Invalid id/);
    await expect(library.deleteBook(alice, "../x")).rejects.toThrow();
    expect(await library.searchPassages(alice, "../../accounts", buildQuery("users"))).toEqual([]);
  });

  it("records progress, clamps to the book's length and marks it finished", async () => {
    expect(await library.recordProgress(alice, book, 120, "manual")).toMatchObject({ current_page: 120, status: "reading", finished_at: null });
    const done = await library.recordProgress(alice, book, 999, "manual");
    expect(done).toMatchObject({ current_page: 300, status: "finished" });
    expect(done.finished_at).not.toBeNull();
    expect(await library.recordProgress(alice, book, 150, "description")).toMatchObject({ current_page: 150, status: "reading", finished_at: null });
    await expect(library.recordProgress(alice, book, -1, "manual")).rejects.toThrow(/negative/);

    const events = await library.listEvents(alice, { bookId: book });
    expect(events.map((e) => e.page).sort((a, b) => a - b)).toEqual([120, 150, 300]);
    expect(await library.listEvents(bob)).toEqual([]);
  });

  it("does not lose updates when many arrive at once", async () => {
    const extra = await library.addBook(alice, { title: "Busy", author: null, isbn: null, cover_url: null, total_pages: null, status: "reading" });
    await Promise.all(Array.from({ length: 40 }, (_, i) => library.recordProgress(alice, extra.id, i + 1, "manual")));
    expect(await library.listEvents(alice, { bookId: extra.id })).toHaveLength(40);
    await library.deleteBook(alice, extra.id);
    expect(await library.listEvents(alice, { bookId: extra.id })).toEqual([]);
  });

  it("imports text, saves photographed pages, and finds a passage from a loose description", async () => {
    const { chunks } = chunkSections([
      { title: "One", text: "Mara reached the harbour at dusk. The ferry had already gone, and gulls wheeled over the empty quay." },
      { title: "Two", text: "At the lighthouse she climbed the stairs and found a letter tucked under the lamp. It was addressed to her mother." },
      { title: "Three", text: "The storm broke the next morning. Old Tom rowed out past the rocks and did not come back." },
    ]);
    expect(await library.replaceText(alice, book, "salt-road.epub", chunks)).toBe(3);
    await library.saveScan(alice, book, 212, [
      { page_number: 211, text: "The left-hand page, about the harbour master." },
      { page_number: null, text: "A photographed page about the lighthouse keeper and his lamps." },
    ]);
    // Photographing page 212 again replaces it rather than adding a duplicate.
    await library.saveScan(alice, book, 212, [{ page_number: 212, text: "A sharper photo of the lighthouse keeper page." }]);

    const saved = (await library.getBook(alice, book))!;
    expect(saved).toMatchObject({ text_name: "salt-road.epub", text_passages: 3, scan_pages: 2, current_page: 212 });

    const hits = await library.searchPassages(alice, book, buildQuery("they had just got to the lighthouse and she finds the letters"));
    expect(hits[0].chapter).toBe("Two");
    const byName = await library.searchPassages(alice, book, buildQuery("the boat in the storm", ["Old Tom"]));
    expect(byName[0].chapter).toBe("Three");
    expect(hits.filter((h) => h.kind === "scan").map((h) => h.page_number)).toEqual([212]);
    expect(hits.find((h) => h.kind === "scan")!.content).toContain("sharper");

    // Bob cannot search Alice's book even with its id.
    expect(await library.searchPassages(bob, book, buildQuery("lighthouse letter"))).toEqual([]);

    await library.removeText(alice, book);
    expect(await library.getBook(alice, book)).toMatchObject({ text_name: null, text_passages: 0, scan_pages: 2 });
  });

  it("counts AI requests per reader per day", async () => {
    expect(await library.bumpAiUsage(alice)).toBe(1);
    expect(await library.bumpAiUsage(alice)).toBe(2);
    expect(await library.bumpAiUsage(bob)).toBe(1);
  });

  it("removes a book's history and saved text when the book is deleted", async () => {
    await library.deleteBook(alice, book);
    expect(await library.getBook(alice, book)).toBeNull();
    expect(await library.listEvents(alice, { bookId: book })).toEqual([]);
    expect(readdirSync(path.join(dir, "users", alice, "passages"))).toEqual([]);
    expect(readdirSync(path.join(dir, "users", alice)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
