import { describe, expect, it, vi } from "vitest";
import { findOffset, locate, snippetAt, type LocateDeps, type PassageHit } from "@/lib/locate";

const lighthouse: PassageHit = {
  kind: "text", page_number: null, start_pct: 0.4, end_pct: 0.5, chapter: "Two",
  content: "Mara climbed the stairs slowly. At the top she found a letter tucked under the lamp. It was addressed to her mother.",
};
const scan: PassageHit = {
  kind: "scan", page_number: 212, start_pct: null, end_pct: null, chapter: null,
  content: "The keeper trimmed the wick and said nothing.",
};

function deps(over: Partial<LocateDeps> = {}): LocateDeps {
  return {
    hasPassages: true,
    terms: async () => ["lamp"],
    search: async () => [lighthouse, scan],
    choose: async () => ({ index: 0, confidence: "high", openingWords: "at the top she found a" }),
    estimate: async () => ({ percent: null, chapter: null, confidence: "low", note: null }),
    ...over,
  };
}

describe("locate", () => {
  it("places a match inside imported text and maps it to the reader's edition", async () => {
    const result = await locate("she found the letter at the lighthouse", { total_pages: 300 }, deps());
    expect(result.kind).toBe("text");
    expect(result.chapter).toBe("Two");
    expect(result.snippet?.startsWith("At the top she found a letter")).toBe(true);
    // The match starts about 27% into a passage spanning 40–50% of the book.
    expect(result.percent).toBe(43);
    expect(result.page).toBe(128);
  });

  it("uses the printed page number for a photographed page", async () => {
    const result = await locate("the keeper trimming the wick", { total_pages: 424 },
      deps({ choose: async () => ({ index: 1, confidence: "medium", openingWords: null }) }));
    expect(result).toMatchObject({ kind: "scan", page: 212, percent: 50, confidence: "medium" });
  });

  it("still searches with the reader's own words when term expansion fails", async () => {
    const search = vi.fn(async () => [lighthouse]);
    await locate("the lighthouse letter", { total_pages: 100 },
      deps({ terms: async () => { throw new Error("down"); }, search }));
    expect(search).toHaveBeenCalledWith({ terms: ["lighthous", "letter"], phrases: [] });
  });

  it("falls back to an estimate when no passage fits, and says so", async () => {
    const result = await locate("the lighthouse letter", { total_pages: 200 }, deps({
      choose: async () => ({ index: null, confidence: "low", openingWords: null }),
      estimate: async () => ({ percent: 61.4, chapter: "Chapter 9", confidence: "low", note: "Roughly." }),
    }));
    expect(result).toMatchObject({ kind: "estimate", page: 123, percent: 61, chapter: "Chapter 9", snippet: null });
  });

  it("skips searching for a book with nothing saved and admits when it cannot answer", async () => {
    const search = vi.fn(async () => []);
    const result = await locate("the lighthouse letter", { total_pages: null }, deps({ hasPassages: false, search }));
    expect(search).not.toHaveBeenCalled();
    expect(result.kind).toBe("none");
    expect(result.note).toMatch(/Import the book's text/);
  });

  it("gives a percent but no page when the edition's length is unknown", async () => {
    const result = await locate("she found the letter", { total_pages: null }, deps());
    expect(result.page).toBeNull();
    expect(result.percent).toBe(43);
  });
});

describe("snippets", () => {
  it("finds quoted words despite case and punctuation differences", () => {
    expect(findOffset('He said, "Wait — not yet!" and ran.', "wait not yet")).toBe(10);
    expect(findOffset("Nothing here.", "completely different words")).toBe(0);
    expect(findOffset("Text (with) brackets.", "(with) brackets")).toBe(6);
  });

  it("cuts long snippets at a word", () => {
    const s = snippetAt("word ".repeat(200), 0);
    expect(s.length).toBeLessThanOrEqual(321);
    expect(s.endsWith("word…")).toBe(true);
  });
});
