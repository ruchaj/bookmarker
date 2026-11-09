"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteBook, updateBook } from "@/app/actions";
import type { Book, BookStatus } from "@/lib/types";

export function BookDetails({ book }: { book: Pick<Book, "id" | "title" | "author" | "total_pages" | "status"> }) {
  const router = useRouter();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author ?? "");
  const [pages, setPages] = useState(book.total_pages ? String(book.total_pages) : "");
  const [status, setStatus] = useState<BookStatus>(book.status);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // Saving a page can move the book to another shelf; keep this form in step.
  const [seenStatus, setSeenStatus] = useState(book.status);
  if (seenStatus !== book.status) {
    setSeenStatus(book.status);
    setStatus(book.status);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const total = pages.trim() ? Number(pages) : null;
    if (total != null && (!Number.isInteger(total) || total < 1)) {
      return setMessage({ ok: false, text: "Enter the number of pages as a whole number, or leave it empty." });
    }
    startTransition(async () => {
      const result = await updateBook({ bookId: book.id, title, author, total_pages: total, status });
      setMessage(result.ok ? { ok: true, text: "Changes saved." } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="d-title">Title</label>
          <input className="field" id="d-title" required maxLength={300} value={title}
            onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="d-author">Author</label>
          <input className="field" id="d-author" maxLength={300} value={author}
            onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="d-pages">Pages in your copy</label>
          <input className="field" id="d-pages" inputMode="numeric" pattern="[0-9]*" value={pages}
            onChange={(e) => setPages(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="d-status">Shelf</label>
          <select className="field" id="d-status" value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
            <option value="reading">Reading now</option>
            <option value="want">Want to read</option>
            <option value="finished">Finished</option>
          </select>
        </div>
      </div>

      <div aria-live="polite">
        {message && <p className={message.ok ? "notice" : "alert"} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
        {confirmingDelete ? (
          <>
            <span className="text-[0.9375rem]">Delete this book, its history and its saved text?</span>
            <button type="button" className="btn btn-danger" disabled={pending}
              onClick={() => startTransition(async () => {
                const result = await deleteBook(book.id);
                if (result && !result.ok) setMessage({ ok: false, text: result.error });
              })}>
              Delete book
            </button>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="btn-text text-ribbon-deep" onClick={() => setConfirmingDelete(true)}>
            Delete book
          </button>
        )}
      </div>
    </form>
  );
}
