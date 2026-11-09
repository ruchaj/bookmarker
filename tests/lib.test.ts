import { describe, expect, it } from "vitest";
import { buildTsQuery, words } from "@/lib/search";
import { chunkSections, sectionsFromPlainText, TARGET_CHARS } from "@/lib/chunk";
import { pageFromFraction, percentRead, readingStats } from "@/lib/progress";
import { mapCatalogDocs } from "@/lib/catalog";

describe("buildTsQuery", () => {
  it("keeps content words and drops filler", () => {
    const q = buildTsQuery("I think they had just arrived at the lighthouse and found the letter");
    expect(q.split(" | ")).toEqual(["arrived", "lighthouse", "found", "letter"]);
  });

  it("adds phrases for multi-word terms and never emits unsafe characters", () => {
    const q = buildTsQuery("the keeper's dog", ["Old Tom", "sea-cave", "'); drop table books;--", "!!!"]);
    expect(q).toContain("(old <-> tom)");
    expect(q).toContain("(sea <-> cave)");
    expect(q).toMatch(/^[a-z0-9 |()<>-]+$/);
  });

  it("returns an empty string when nothing is searchable", () => {
    expect(buildTsQuery("the and of it")).toBe("");
  });

  it("strips accents", () => {
    expect(words("Café Brontë")).toEqual(["cafe", "bronte"]);
  });
});

describe("chunkSections", () => {
  const para = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed} sentence ${i}.`).join(" ");

  it("produces ordered passages that cover the whole book", () => {
    const sections = [
      { title: "One", text: [para(30, "a"), para(30, "b"), para(30, "c")].join("\n\n") },
      { title: "Two", text: [para(10, "d"), para(200, "e")].join("\n\n") },
    ];
    const { chunks, totalChars } = chunkSections(sections);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0].start_pct).toBe(0);
    expect(chunks.at(-1)!.end_pct).toBeCloseTo(1, 5);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start_pct).toBeCloseTo(chunks[i - 1].end_pct, 5);
      expect(chunks[i].idx).toBe(i);
    }
    expect(chunks.every((c) => c.content.length <= 1800)).toBe(true);
    expect(chunks.reduce((n, c) => n + c.content.length, 0)).toBe(totalChars);
    expect(chunks.find((c) => c.content.startsWith("d sentence"))!.chapter).toBe("Two");
    expect(TARGET_CHARS).toBeLessThan(1800);
  });

  it("splits a paragraph with no sentence breaks", () => {
    const { chunks } = chunkSections([{ title: null, text: "word ".repeat(2000) }]);
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.every((c) => c.content.length <= 1800)).toBe(true);
  });

  it("handles empty input", () => {
    expect(chunkSections([{ title: null, text: "  \n\n " }])).toEqual({ chunks: [], totalChars: 0 });
  });
});

describe("sectionsFromPlainText", () => {
  it("removes the Project Gutenberg wrapper and finds chapters", () => {
    const raw = [
      "The Project Gutenberg eBook of Example",
      "*** START OF THE PROJECT GUTENBERG EBOOK EXAMPLE ***",
      "",
      "CHAPTER I. Loomings",
      "",
      "Call me a narrator. Some years ago I went to sea.",
      "",
      "CHAPTER II. The Carpet-Bag",
      "",
      "I stuffed a shirt or two into my old bag.",
      "",
      "*** END OF THE PROJECT GUTENBERG EBOOK EXAMPLE ***",
      "License text that must not be indexed.",
    ].join("\r\n");
    const sections = sectionsFromPlainText(raw);
    expect(sections.map((s) => s.title)).toEqual(["CHAPTER I. Loomings", "CHAPTER II. The Carpet-Bag"]);
    expect(sections[1].text).toContain("old bag");
    expect(JSON.stringify(sections)).not.toContain("License");
  });

  it("does not treat a sentence starting with 'Part' as a heading", () => {
    const sections = sectionsFromPlainText("Intro line.\nPart of me wanted to leave.\nMore text.");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBeNull();
  });
});

describe("progress", () => {
  it("computes percent and page mapping", () => {
    expect(percentRead({ current_page: 97, total_pages: 388, status: "reading" })).toBe(25);
    expect(percentRead({ current_page: 500, total_pages: 388, status: "reading" })).toBe(100);
    expect(percentRead({ current_page: 12, total_pages: null, status: "reading" })).toBeNull();
    expect(pageFromFraction(0.5, 300)).toBe(150);
    expect(pageFromFraction(0, 300)).toBe(1);
    expect(pageFromFraction(0.5, null)).toBeNull();
  });

  it("counts pages per day, ignores going backwards, and tracks streaks", () => {
    const now = new Date(2026, 10, 9, 20, 0, 0);
    const at = (daysAgo: number, hour = 12) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysAgo);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const events = [
      { book_id: "a", page: 40, created_at: at(10) },
      { book_id: "a", page: 60, created_at: at(2) },
      { book_id: "a", page: 50, created_at: at(1, 9) }, // went back: no pages
      { book_id: "a", page: 75, created_at: at(1, 21) },
      { book_id: "b", page: 12, created_at: at(0, 8) },
    ];
    const stats = readingStats(events, [
      { status: "finished", finished_at: at(3) },
      { status: "finished", finished_at: new Date(2024, 1, 1).toISOString() },
      { status: "reading", finished_at: null },
    ], now);
    expect(stats.pagesThisWeek).toBe(20 + 25 + 12);
    expect(stats.streakDays).toBe(3);
    expect(stats.finishedThisYear).toBe(1);
  });

  it("keeps yesterday's streak alive until today is over", () => {
    const now = new Date(2026, 10, 9, 7, 0, 0);
    const y = new Date(now); y.setDate(y.getDate() - 1);
    expect(readingStats([{ book_id: "a", page: 5, created_at: y.toISOString() }], [], now).streakDays).toBe(1);
  });
});

describe("mapCatalogDocs", () => {
  it("maps Open Library results and drops incomplete ones", () => {
    const out = mapCatalogDocs([
      { key: "/works/OL1W", title: "Middlemarch", author_name: ["George Eliot"], first_publish_year: 1871,
        number_of_pages_median: 880, cover_i: 123, isbn: ["0141439548", "9780141439549"] },
      { title: "No key" },
      { key: "/works/OL2W", title: "Bare" },
    ]);
    expect(out).toEqual([
      { key: "/works/OL1W", title: "Middlemarch", author: "George Eliot", year: 1871, pages: 880,
        isbn: "9780141439549", cover_url: "https://covers.openlibrary.org/b/id/123-M.jpg" },
      { key: "/works/OL2W", title: "Bare", author: null, year: null, pages: null, isbn: null, cover_url: null },
    ]);
  });
});
