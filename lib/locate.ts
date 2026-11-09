// "Where was I?" — turns a reader's description into a place in the book.
// The outside world (database search, AI calls) is passed in, so the
// decision logic can be tested on its own.

import { pageFromFraction } from "./progress";
import { buildTsQuery } from "./search";
import type { LocateResult } from "./types";

export interface PassageHit {
  kind: "text" | "scan";
  page_number: number | null;
  start_pct: number | null;
  end_pct: number | null;
  chapter: string | null;
  content: string;
}

type Confidence = "high" | "medium" | "low";

export interface LocateDeps {
  /** Whether this book has any imported text or photographed pages to search. */
  hasPassages: boolean;
  terms(description: string): Promise<string[]>;
  search(tsQuery: string): Promise<PassageHit[]>;
  choose(
    description: string,
    candidates: { content: string; label: string }[],
  ): Promise<{ index: number | null; confidence: Confidence; openingWords: string | null }>;
  estimate(
    description: string,
  ): Promise<{ percent: number | null; chapter: string | null; confidence: "medium" | "low"; note: string | null }>;
}

const MAX_CANDIDATES = 14;
const SNIPPET_CHARS = 320;

function label(hit: PassageHit): string {
  if (hit.kind === "scan") return hit.page_number != null ? `page ${hit.page_number}` : "photographed page";
  return `${Math.round((hit.start_pct ?? 0) * 100)}% through the book`;
}

/** Where in `content` the quoted opening words start, ignoring case and spacing. */
export function findOffset(content: string, openingWords: string | null): number {
  const wanted = (openingWords ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!wanted || wanted.length < 2) return 0;
  const pattern = wanted.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^\\p{L}\\p{N}]+");
  const found = new RegExp(pattern, "iu").exec(content);
  return found ? found.index : 0;
}

export function snippetAt(content: string, offset: number): string {
  const rest = content.slice(offset);
  if (rest.length <= SNIPPET_CHARS) return rest.trim();
  const cut = rest.lastIndexOf(" ", SNIPPET_CHARS);
  return `${rest.slice(0, cut > 0 ? cut : SNIPPET_CHARS).trim()}…`;
}

export async function locate(
  description: string,
  book: { total_pages: number | null },
  deps: LocateDeps,
): Promise<LocateResult> {
  if (deps.hasPassages) {
    // Extra search words are a bonus; the reader's own words still work without them.
    const extra = await deps.terms(description).catch(() => [] as string[]);
    const query = buildTsQuery(description, extra);
    const hits = query ? (await deps.search(query)).slice(0, MAX_CANDIDATES) : [];

    if (hits.length > 0) {
      const choice = await deps.choose(
        description,
        hits.map((h) => ({ content: h.content, label: label(h) })),
      );
      if (choice.index != null) {
        const hit = hits[choice.index];
        const offset = findOffset(hit.content, choice.openingWords);
        const snippet = snippetAt(hit.content, offset);

        if (hit.kind === "scan") {
          const page = hit.page_number;
          return {
            kind: "scan",
            page,
            percent:
              page != null && book.total_pages
                ? Math.min(100, Math.round((page / book.total_pages) * 100))
                : null,
            chapter: hit.chapter,
            confidence: choice.confidence,
            snippet,
            note: null,
          };
        }

        const start = hit.start_pct ?? 0;
        const end = hit.end_pct ?? start;
        const fraction = start + (end - start) * (offset / Math.max(1, hit.content.length));
        return {
          kind: "text",
          page: pageFromFraction(fraction, book.total_pages),
          percent: Math.round(fraction * 100),
          chapter: hit.chapter,
          confidence: choice.confidence,
          snippet,
          note: null,
        };
      }
    }
  }

  const guess = await deps.estimate(description);
  if (guess.percent == null) {
    return {
      kind: "none",
      page: null,
      percent: null,
      chapter: null,
      confidence: "low",
      snippet: null,
      note: deps.hasPassages
        ? "Nothing in this book's saved text matches that. Try naming a character, place or object from the scene."
        : "This book is not one the AI knows well enough to place the scene. Import the book's text or photograph pages as you read, and it can find your place exactly.",
    };
  }
  return {
    kind: "estimate",
    page: pageFromFraction(guess.percent / 100, book.total_pages),
    percent: Math.round(guess.percent),
    chapter: guess.chapter,
    confidence: guess.confidence,
    snippet: null,
    note: guess.note,
  };
}
