"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { recordProgress, saveScan } from "@/app/actions";
import { postJson, preparePhoto } from "@/lib/image";
import type { Book, ScanResult } from "@/lib/types";

interface Reading {
  previewUrl: string;
  scan: ScanResult;
  page: string;
}

export function MarkPage({ book }: { book: Pick<Book, "id" | "current_page" | "total_pages"> }) {
  const router = useRouter();
  const [page, setPage] = useState(book.current_page > 0 ? String(book.current_page) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // When the saved page changes elsewhere on the screen, show it here too.
  const [seenPage, setSeenPage] = useState(book.current_page);
  if (seenPage !== book.current_page) {
    setSeenPage(book.current_page);
    setPage(book.current_page > 0 ? String(book.current_page) : "");
  }

  function parsePage(text: string): number | null {
    const n = Number(text.trim());
    if (!text.trim() || !Number.isInteger(n) || n < 0) return null;
    return n;
  }

  function saveManual(event: React.FormEvent) {
    event.preventDefault();
    const n = parsePage(page);
    if (n == null) return setError("Enter the page number you're on.");
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await recordProgress(book.id, n, "manual");
      if (!result.ok) return setError(result.error);
      setSaved(`Saved: page ${book.total_pages ? Math.min(n, book.total_pages) : n}.`);
      router.refresh();
    });
  }

  async function readPhoto(file: File) {
    setScanning(true);
    setError(null);
    setSaved(null);
    try {
      const photo = await preparePhoto(file);
      const scan = await postJson<ScanResult>(`/api/books/${book.id}/scan`, {
        image: photo.image,
        mediaType: photo.mediaType,
      });
      if (!scan.is_book_page || scan.pages.length === 0) {
        setError("That doesn't look like a page of a book. Fill the frame with the page and try again.");
        return;
      }
      const numbers = scan.pages.map((p) => p.page_number).filter((n): n is number => n != null);
      setReading({
        previewUrl: photo.previewUrl,
        scan,
        page: numbers.length ? String(Math.max(...numbers)) : "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo couldn't be read. Try again.");
    } finally {
      setScanning(false);
    }
  }

  function savePhoto(event: React.FormEvent) {
    event.preventDefault();
    if (!reading) return;
    const n = parsePage(reading.page);
    if (n == null) return setError("Enter the page number shown in the photo.");
    setError(null);
    startTransition(async () => {
      const result = await saveScan({ bookId: book.id, page: n, pages: reading.scan.pages });
      if (!result.ok) return setError(result.error);
      setReading(null);
      setPage(String(n));
      setSaved(`Saved: page ${n}. The page's text is now searchable.`);
      router.refresh();
    });
  }

  if (reading) {
    const detected = reading.scan.pages.some((p) => p.page_number != null);
    const text = reading.scan.pages.map((p) => p.text).join(" ").trim();
    return (
      <form onSubmit={savePhoto} className="mt-4">
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={reading.previewUrl} alt="The page you photographed"
            className="h-40 w-28 shrink-0 rounded-[3px] border border-rule object-cover" />
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="photo-page">
              {detected ? "Page number found in the photo" : "No page number is visible. Enter it:"}
            </label>
            <input className="field max-w-32" id="photo-page" inputMode="numeric" pattern="[0-9]*" autoFocus
              value={reading.page}
              onChange={(e) => setReading({ ...reading, page: e.target.value })} />
            {detected && <p className="hint mt-1.5">Correct it if it&apos;s wrong.</p>}
            {text && (
              <p className="mt-3 line-clamp-3 font-serif text-[0.9375rem] leading-relaxed text-muted">{text}</p>
            )}
          </div>
        </div>
        {error && <p className="alert mt-4" role="alert">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save this page"}</button>
          <button type="button" className="btn btn-secondary" disabled={pending}
            onClick={() => { setReading(null); setError(null); }}>
            Discard photo
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-4">
      <form onSubmit={saveManual} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="page">Page you&apos;re on</label>
          <input className="field w-28" id="page" inputMode="numeric" pattern="[0-9]*" value={page}
            onChange={(e) => setPage(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={pending || scanning}>
          {pending ? "Saving…" : "Save page"}
        </button>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void readPhoto(file);
          }} />
        <button type="button" className="btn btn-secondary" disabled={pending || scanning}
          onClick={() => fileInput.current?.click()}>
          {scanning ? "Reading the photo…" : "Photograph the page"}
        </button>
      </form>
      <div aria-live="polite">
        {error && <p className="alert mt-4" role="alert">{error}</p>}
        {saved && <p className="notice mt-4">{saved}</p>}
      </div>
    </div>
  );
}
