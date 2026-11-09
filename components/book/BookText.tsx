"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { chunkSections, sectionsFromPlainText, type Section } from "@/lib/chunk";

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_PASSAGES = 8000;

async function send(url: string, method: "PUT" | "DELETE", body?: unknown): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Something went wrong. Try again.");
  }
}

export function BookText({
  bookId,
  textName,
  passageCount,
}: {
  bookId: string;
  textName: string | null;
  passageCount: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const endpoint = `/api/books/${bookId}/text`;

  async function removeText() {
    setWorking(true);
    setError(null);
    try {
      await send(endpoint, "DELETE");
      setStatus("The book's text was removed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The text couldn't be removed.");
    } finally {
      setWorking(false);
    }
  }

  async function importFile(file: File) {
    setWorking(true);
    setError(null);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("That file is over 40 MB. Try a text-only copy of the book.");

      setStatus("Reading the file…");
      let sections: Section[];
      if (/\.epub$/i.test(file.name)) {
        const { parseEpub } = await import("@/lib/epub");
        sections = (await parseEpub(await file.arrayBuffer())).sections;
      } else if (/\.(txt|text|md)$/i.test(file.name) || file.type.startsWith("text/")) {
        sections = sectionsFromPlainText(await file.text());
      } else {
        throw new Error("Choose an EPUB or a plain-text (.txt) file. PDFs and Kindle files aren't supported.");
      }

      const { chunks } = chunkSections(sections);
      if (chunks.length === 0) throw new Error("No readable text was found in that file.");
      if (chunks.length > MAX_PASSAGES) throw new Error("That file is too long to import as one book.");

      setStatus(`Saving ${chunks.length.toLocaleString()} passages…`);
      await send(endpoint, "PUT", { name: file.name.slice(0, 300), chunks });

      setStatus(`Imported ${file.name}: ${chunks.length.toLocaleString()} passages are now searchable.`);
      router.refresh();
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "The file couldn't be imported.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="max-w-prose text-muted">
        {textName ? (
          <>
            <strong className="font-semibold text-ink">{textName}</strong> is imported
            ({passageCount.toLocaleString()} passages), so your place can be found anywhere in the book.
          </>
        ) : (
          <>
            Import an EPUB or plain-text copy of this book that you own, and Bookmarker can find your exact place
            from a description. The file is read on this device; only its text is saved, in your private library.
          </>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <input ref={fileInput} type="file" accept=".epub,.txt,application/epub+zip,text/plain" className="sr-only"
          tabIndex={-1} aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }} />
        <button type="button" className="btn btn-secondary" disabled={working} onClick={() => fileInput.current?.click()}>
          {textName ? "Replace the text" : "Import the book's text"}
        </button>
        {textName && (
          <button type="button" className="btn-text" disabled={working}
            onClick={() => void removeText()}>
            Remove the text
          </button>
        )}
      </div>

      <div aria-live="polite">
        {status && <p className="notice mt-4">{status}</p>}
        {error && <p className="alert mt-4" role="alert">{error}</p>}
      </div>
    </div>
  );
}
