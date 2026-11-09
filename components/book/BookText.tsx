"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { chunkSections, sectionsFromPlainText, type Section } from "@/lib/chunk";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_PASSAGES = 8000;
const BATCH = 100;

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

  async function removeText(announce = true) {
    const supabase = createClient();
    const { error: failed } = await supabase.from("passages").delete().eq("book_id", bookId).eq("kind", "text");
    if (failed) throw new Error("The saved text couldn't be removed. Try again.");
    await supabase.from("books").update({ text_name: null, text_chars: 0 }).eq("id", bookId);
    if (announce) {
      setStatus("The book's text was removed.");
      router.refresh();
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

      const { chunks, totalChars } = chunkSections(sections);
      if (chunks.length === 0) throw new Error("No readable text was found in that file.");
      if (chunks.length > MAX_PASSAGES) throw new Error("That file is too long to import as one book.");

      const supabase = createClient();
      await removeText(false);
      try {
        for (let i = 0; i < chunks.length; i += BATCH) {
          setStatus(`Saving passage ${Math.min(i + BATCH, chunks.length)} of ${chunks.length}…`);
          const { error: failed } = await supabase.from("passages").insert(
            chunks.slice(i, i + BATCH).map((c) => ({ ...c, book_id: bookId, kind: "text" })),
          );
          if (failed) throw new Error("Saving the text stopped partway. Check your connection and import the file again.");
        }
        const { error: failed } = await supabase
          .from("books")
          .update({ text_name: file.name.slice(0, 300), text_chars: totalChars })
          .eq("id", bookId);
        if (failed) throw new Error("The text was saved but the book couldn't be updated. Import the file again.");
      } catch (e) {
        await removeText(false).catch(() => {});
        throw e;
      }

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
            onClick={() => {
              setWorking(true);
              setError(null);
              removeText()
                .catch((e) => setError(e instanceof Error ? e.message : "The text couldn't be removed."))
                .finally(() => setWorking(false));
            }}>
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
