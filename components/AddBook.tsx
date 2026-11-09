"use client";

import { useRef, useState, useTransition } from "react";
import { addBook } from "@/app/actions";
import { postJson, preparePhoto } from "@/lib/image";
import type { BookStatus, CatalogResult, IdentifyResult } from "@/lib/types";
import { Cover } from "./Cover";

interface Draft {
  title: string;
  author: string;
  pages: string;
  isbn: string | null;
  cover_url: string | null;
  status: BookStatus;
}

const STATUSES: { value: BookStatus; label: string }[] = [
  { value: "reading", label: "Reading now" },
  { value: "want", label: "Want to read" },
  { value: "finished", label: "Finished" },
];

export function AddBook() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[] | null>(null);
  const [busy, setBusy] = useState<"search" | "photo" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function search(text: string) {
    const q = text.trim();
    if (q.length < 2) return;
    setBusy("search");
    setMessage(null);
    try {
      const response = await fetch(`/api/catalog?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as { results?: CatalogResult[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Search failed. Try again.");
      setResults(data.results ?? []);
    } catch (error) {
      setResults(null);
      setMessage(error instanceof Error ? error.message : "Search failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function fromPhoto(file: File) {
    setBusy("photo");
    setMessage(null);
    try {
      const photo = await preparePhoto(file);
      const found = await postJson<IdentifyResult>("/api/identify", {
        image: photo.image,
        mediaType: photo.mediaType,
      });
      if (!found.found) {
        setMessage("No title or ISBN could be read from that photo. Try the front cover in good light, or search by title.");
        return;
      }
      const q = found.isbn ?? [found.title, found.author].filter(Boolean).join(" ");
      setQuery(q);
      await search(q);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The photo couldn't be read. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function choose(result: CatalogResult) {
    setSaveError(null);
    setDraft({
      title: result.title,
      author: result.author ?? "",
      pages: result.pages ? String(result.pages) : "",
      isbn: result.isbn,
      cover_url: result.cover_url,
      status: "reading",
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const pages = draft.pages.trim() ? Number(draft.pages) : null;
    if (pages != null && (!Number.isInteger(pages) || pages < 1)) {
      setSaveError("Enter the number of pages as a whole number, or leave it empty.");
      return;
    }
    setSaveError(null);
    startSaving(async () => {
      const result = await addBook({
        title: draft.title,
        author: draft.author || null,
        isbn: draft.isbn,
        cover_url: draft.cover_url,
        total_pages: pages,
        status: draft.status,
      });
      // On success the action redirects to the new book's page.
      if (result && !result.ok) setSaveError(result.error);
    });
  }

  if (draft) {
    return (
      <form onSubmit={save} className="mt-8 space-y-5">
        <div className="flex gap-4">
          <Cover book={{ title: draft.title || "Untitled", cover_url: draft.cover_url }} size="md" />
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input className="field" id="title" required maxLength={300} value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="author">Author</label>
              <input className="field" id="author" maxLength={300} value={draft.author}
                onChange={(e) => setDraft({ ...draft, author: e.target.value })} />
            </div>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="pages">Pages in your copy</label>
          <input className="field max-w-40" id="pages" inputMode="numeric" pattern="[0-9]*" value={draft.pages}
            aria-describedby="pages-hint"
            onChange={(e) => setDraft({ ...draft, pages: e.target.value })} />
          <p id="pages-hint" className="hint mt-1.5">
            Editions differ, so check the last numbered page of your copy. You can add this later.
          </p>
        </div>

        <fieldset>
          <legend className="label">Shelf</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <label key={s.value}
                className={`btn cursor-pointer ${draft.status === s.value ? "btn-primary" : "btn-secondary"}`}>
                <input type="radio" name="status" className="sr-only" value={s.value}
                  checked={draft.status === s.value}
                  onChange={() => setDraft({ ...draft, status: s.value })} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        {saveError && <p className="alert" role="alert">{saveError}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Adding…" : "Add to library"}
          </button>
          <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setDraft(null)}>
            Back to search
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-6">
      <form
        className="flex gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <label className="sr-only" htmlFor="q">Title, author or ISBN</label>
        <input className="field" id="q" type="search" placeholder="Title, author or ISBN" value={query}
          onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn-primary shrink-0" disabled={busy !== null || query.trim().length < 2}>
          {busy === "search" ? "Searching…" : "Search"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-x-5">
        <input ref={fileInput} type="file" accept="image/*" className="sr-only" tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void fromPhoto(file);
          }} />
        <button type="button" className="btn-text" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          {busy === "photo" ? "Reading the photo…" : "Use a photo of the cover"}
        </button>
        <button type="button" className="btn-text" disabled={busy !== null}
          onClick={() => {
            setSaveError(null);
            setDraft({ title: query.trim(), author: "", pages: "", isbn: null, cover_url: null, status: "reading" });
          }}>
          Enter it yourself
        </button>
      </div>

      {message && <p className="alert mt-4" role="alert">{message}</p>}

      <div aria-live="polite">
        {results && results.length === 0 && (
          <p className="notice mt-6">
            No books matched. Check the spelling, try the ISBN from the back cover, or enter the book yourself.
          </p>
        )}
        {results && results.length > 0 && (
          <ul className="mt-6 divide-y divide-rule/60 border-t border-rule">
            {results.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={() => choose(r)}
                  className="group flex w-full cursor-pointer gap-4 py-3 text-left">
                  <Cover book={r} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-lg font-semibold leading-snug group-hover:underline">
                      {r.title}
                    </span>
                    <span className="block text-[0.9375rem] text-muted">{r.author ?? "Unknown author"}</span>
                    <span className="mt-1 block text-sm text-muted">
                      {[r.year && `First published ${r.year}`, r.pages && `about ${r.pages} pages`]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
