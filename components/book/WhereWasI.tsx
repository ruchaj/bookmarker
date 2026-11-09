"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordProgress } from "@/app/actions";
import { postJson } from "@/lib/image";
import type { LocateResult } from "@/lib/types";

const SOURCE: Record<LocateResult["kind"], string> = {
  text: "Found in the book's text.",
  scan: "Found in a page you photographed.",
  estimate: "An estimate from what the AI knows about this book, not from its text. Check it against your copy.",
  none: "",
};

export function WhereWasI({
  bookId,
  hasText,
  scanCount,
  hasLength,
}: {
  bookId: string;
  hasText: boolean;
  scanCount: number;
  hasLength: boolean;
}) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<LocateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scope =
    hasText && scanCount > 0
      ? `Searches the imported text and ${scanCount} photographed ${scanCount === 1 ? "page" : "pages"}.`
      : hasText
        ? "Searches the text you imported for this book."
        : scanCount > 0
          ? `Searches the ${scanCount} ${scanCount === 1 ? "page" : "pages"} you've photographed. Import the book's text below to cover the whole book.`
          : "No text is saved for this book yet, so the answer will be a rough estimate. Import the book's text below to get the exact page.";

  async function find(event: React.FormEvent) {
    event.preventDefault();
    if (description.trim().length < 8) return setError("Describe the scene in a few more words.");
    setSearching(true);
    setError(null);
    setSaved(null);
    setResult(null);
    try {
      setResult(await postJson<LocateResult>(`/api/books/${bookId}/locate`, { description }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function setPage(page: number) {
    startTransition(async () => {
      const outcome = await recordProgress(bookId, page, "description");
      if (!outcome.ok) return setError(outcome.error);
      setResult(null);
      setDescription("");
      setSaved(`Saved: page ${page}.`);
      router.refresh();
    });
  }

  const approximate = result != null && (result.kind === "estimate" || result.confidence === "low");

  return (
    <div className="mt-3">
      <form onSubmit={find}>
        <label className="label" htmlFor="description">The last thing you remember reading</label>
        <textarea className="field min-h-24 resize-y" id="description" maxLength={1000} value={description}
          aria-describedby="description-hint"
          placeholder="They had just reached the lighthouse, and she found a letter under the lamp."
          onChange={(e) => setDescription(e.target.value)} />
        <p id="description-hint" className="hint mt-1.5">
          Names, places and objects help most. {scope}
        </p>
        <button className="btn btn-primary mt-4" disabled={searching || pending}>
          {searching ? "Looking through the book…" : "Find my page"}
        </button>
      </form>

      <div aria-live="polite">
        {error && <p className="alert mt-4" role="alert">{error}</p>}
        {saved && <p className="notice mt-4">{saved}</p>}

        {result && result.kind === "none" && <p className="notice mt-5">{result.note}</p>}

        {result && result.kind !== "none" && (
          <div className="mt-5 rounded-lg border border-rule bg-sheet p-5">
            <p className="font-serif text-4xl font-semibold leading-tight">
              {result.page != null
                ? `${approximate ? "About page" : "Page"} ${result.page}`
                : `About ${result.percent}% through`}
            </p>
            <p className="mt-1 text-[0.9375rem] text-muted">
              {[result.chapter, result.page != null && result.percent != null && `${result.percent}% through the book`]
                .filter(Boolean)
                .join(", ")}
            </p>

            {result.snippet && (
              <blockquote className="mt-4 border-l-2 border-ribbon pl-4 font-serif leading-relaxed">
                {result.snippet}
              </blockquote>
            )}

            <p className="hint mt-4">
              {SOURCE[result.kind]}
              {result.kind !== "estimate" && result.confidence === "low" && " This is a weak match, so read the passage before you trust it."}
              {result.kind !== "estimate" && result.confidence === "medium" && " It's a likely match."}
              {result.note && ` ${result.note}`}
            </p>
            {result.page == null && !hasLength && (
              <p className="hint mt-2">
                Add the number of pages in your copy under Book details to get a page number.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              {result.page != null && (
                <button className="btn btn-primary" disabled={pending} onClick={() => setPage(result.page!)}>
                  {pending ? "Saving…" : `Set my page to ${result.page}`}
                </button>
              )}
              <button className="btn btn-secondary" disabled={pending} onClick={() => setResult(null)}>
                That&apos;s not it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
