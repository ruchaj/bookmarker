// Each reader's library: one JSON document for their books and reading
// history, plus one document per book for its searchable text.
//
//   data/users/<user id>/library.json
//   data/users/<user id>/passages/<book id>.json
//
// Every function takes the signed-in user's id and only ever opens files
// inside that user's folder, which is what keeps libraries private.

import "server-only";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Chunk } from "../chunk";
import { rankPassages, type SearchQuery } from "../search";
import type { Book, BookStatus, Passage, ProgressEvent, ProgressSource, ScannedPage } from "../types";
import { assertId, dataDir, isId, readJson, remove, update } from "./files";

interface LibraryFile {
  books: Book[];
  events: ProgressEvent[];
  /** AI requests made on `day` (UTC), for the daily allowance. */
  usage: { day: string; count: number };
}

interface PassagesFile {
  next_id: number;
  passages: Passage[];
}

const userDir = (userId: string) => path.join(dataDir(), "users", assertId(userId));
const libraryFile = (userId: string) => path.join(userDir(userId), "library.json");
const passagesFile = (userId: string, bookId: string) =>
  path.join(userDir(userId), "passages", `${assertId(bookId)}.json`);

const emptyLibrary = (): LibraryFile => ({ books: [], events: [], usage: { day: "", count: 0 } });
const emptyPassages = (): PassagesFile => ({ next_id: 1, passages: [] });

export class NotFoundError extends Error {
  constructor() {
    super("Book not found.");
  }
}

function findBook(library: LibraryFile, bookId: string): Book {
  const book = library.books.find((b) => b.id === bookId);
  if (!book) throw new NotFoundError();
  return book;
}

// ------------------------------------------------------------------ books

export async function listBooks(userId: string): Promise<Book[]> {
  const { books } = await readJson(libraryFile(userId), emptyLibrary);
  return [...books].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getBook(userId: string, bookId: string): Promise<Book | null> {
  if (!isId(bookId)) return null;
  const { books } = await readJson(libraryFile(userId), emptyLibrary);
  return books.find((b) => b.id === bookId.toLowerCase()) ?? null;
}

export interface NewBook {
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  total_pages: number | null;
  status: BookStatus;
}

export function addBook(userId: string, input: NewBook): Promise<Book> {
  return update(libraryFile(userId), emptyLibrary, (library) => {
    const now = new Date().toISOString();
    const finished = input.status === "finished";
    const book: Book = {
      id: randomUUID(),
      ...input,
      current_page: finished ? (input.total_pages ?? 0) : 0,
      text_name: null,
      text_chars: 0,
      text_passages: 0,
      scan_pages: 0,
      created_at: now,
      updated_at: now,
      finished_at: finished ? now : null,
    };
    library.books.push(book);
    return book;
  });
}

export function updateBook(
  userId: string,
  bookId: string,
  fields: { title: string; author: string | null; total_pages: number | null; status: BookStatus },
): Promise<Book> {
  return update(libraryFile(userId), emptyLibrary, (library) => {
    const book = findBook(library, bookId);
    const now = new Date().toISOString();
    book.title = fields.title;
    book.author = fields.author;
    book.total_pages = fields.total_pages;
    book.status = fields.status;
    if (fields.total_pages) book.current_page = Math.min(book.current_page, fields.total_pages);
    book.finished_at = fields.status === "finished" ? (book.finished_at ?? now) : null;
    book.updated_at = now;
    return book;
  });
}

export async function deleteBook(userId: string, bookId: string): Promise<void> {
  await update(libraryFile(userId), emptyLibrary, (library) => {
    findBook(library, bookId);
    library.books = library.books.filter((b) => b.id !== bookId);
    library.events = library.events.filter((e) => e.book_id !== bookId);
  });
  await remove(passagesFile(userId, bookId));
}

// --------------------------------------------------------------- progress

function applyProgress(library: LibraryFile, bookId: string, page: number, source: ProgressSource): Book {
  if (!Number.isInteger(page) || page < 0) throw new Error("Page cannot be negative");
  const book = findBook(library, bookId);
  const now = new Date().toISOString();
  const newPage = book.total_pages ? Math.min(page, book.total_pages) : page;

  library.events.push({ id: randomUUID(), book_id: bookId, page: newPage, source, created_at: now });
  book.current_page = newPage;
  if (book.total_pages && newPage >= book.total_pages) {
    book.status = "finished";
    book.finished_at ??= now;
  } else {
    if (newPage > 0) book.status = "reading";
    book.finished_at = null;
  }
  book.updated_at = now;
  return book;
}

/** Save a new page for a book and keep the book's shelf in step. */
export function recordProgress(userId: string, bookId: string, page: number, source: ProgressSource): Promise<Book> {
  return update(libraryFile(userId), emptyLibrary, (library) => applyProgress(library, bookId, page, source));
}

export async function listEvents(
  userId: string,
  filter: { bookId?: string; since?: string; limit?: number } = {},
): Promise<ProgressEvent[]> {
  const { events } = await readJson(libraryFile(userId), emptyLibrary);
  return events
    .filter((e) => (!filter.bookId || e.book_id === filter.bookId) && (!filter.since || e.created_at >= filter.since))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, filter.limit ?? 3000);
}

// --------------------------------------------------------------- passages

async function setCounts(userId: string, bookId: string, passages: Passage[], text?: { name: string | null; chars: number }) {
  await update(libraryFile(userId), emptyLibrary, (library) => {
    const book = findBook(library, bookId);
    book.text_passages = passages.filter((p) => p.kind === "text").length;
    book.scan_pages = passages.filter((p) => p.kind === "scan").length;
    if (text) {
      book.text_name = text.name;
      book.text_chars = text.chars;
    }
    book.updated_at = new Date().toISOString();
  });
}

/** Replace a book's imported text with these passages. */
export async function replaceText(userId: string, bookId: string, name: string, chunks: Chunk[]): Promise<number> {
  if (!(await getBook(userId, bookId))) throw new NotFoundError();
  const passages = await update(
    passagesFile(userId, bookId),
    emptyPassages,
    (file) => {
      file.passages = file.passages.filter((p) => p.kind !== "text");
      for (const chunk of chunks) {
        file.passages.push({
          id: file.next_id++,
          kind: "text",
          idx: chunk.idx,
          page_number: null,
          start_pct: chunk.start_pct,
          end_pct: chunk.end_pct,
          chapter: chunk.chapter,
          content: chunk.content,
        });
      }
      return file.passages;
    },
    { pretty: false },
  );
  await setCounts(userId, bookId, passages, {
    name,
    chars: chunks.reduce((n, c) => n + c.content.length, 0),
  });
  return chunks.length;
}

export async function removeText(userId: string, bookId: string): Promise<void> {
  if (!(await getBook(userId, bookId))) throw new NotFoundError();
  const passages = await update(
    passagesFile(userId, bookId),
    emptyPassages,
    (file) => (file.passages = file.passages.filter((p) => p.kind !== "text")),
    { pretty: false },
  );
  await setCounts(userId, bookId, passages, { name: null, chars: 0 });
}

/**
 * Save the text of a photographed page (or two-page spread) and move the
 * reader's place to `page`. Re-photographing a page replaces the earlier copy.
 */
export async function saveScan(userId: string, bookId: string, page: number, pages: ScannedPage[]): Promise<Book> {
  if (!(await getBook(userId, bookId))) throw new NotFoundError();
  // With one page in the photo, the confirmed number is that page's number
  // (the reader may have corrected it). With two, it belongs to the later page.
  const scans = pages
    .map((p, i, all) => ({
      text: p.text.trim(),
      page_number: i === all.length - 1 ? page : (p.page_number ?? Math.max(0, page - 1)),
    }))
    .filter((p) => p.text.length > 0);

  if (scans.length > 0) {
    const numbers = new Set(scans.map((s) => s.page_number));
    const passages = await update(
      passagesFile(userId, bookId),
      emptyPassages,
      (file) => {
        file.passages = file.passages.filter((p) => !(p.kind === "scan" && numbers.has(p.page_number ?? -1)));
        for (const scan of scans) {
          file.passages.push({
            id: file.next_id++,
            kind: "scan",
            idx: null,
            page_number: scan.page_number,
            start_pct: null,
            end_pct: null,
            chapter: null,
            content: scan.text,
          });
        }
        return file.passages;
      },
      { pretty: false },
    );
    await setCounts(userId, bookId, passages);
  }
  return recordProgress(userId, bookId, page, "photo");
}

export async function searchPassages(userId: string, bookId: string, query: SearchQuery, limit = 20): Promise<Passage[]> {
  if (!isId(bookId)) return [];
  const { passages } = await readJson(passagesFile(userId, bookId), emptyPassages);
  return rankPassages(passages, query, limit);
}

// ------------------------------------------------------------- AI allowance

/** Count one AI request for this user today (UTC) and return the new total. */
export function bumpAiUsage(userId: string): Promise<number> {
  return update(libraryFile(userId), emptyLibrary, (library) => {
    const today = new Date().toISOString().slice(0, 10);
    if (library.usage?.day !== today) library.usage = { day: today, count: 0 };
    library.usage.count += 1;
    return library.usage.count;
  });
}

/** Remove everything a user has stored. */
export async function deleteLibrary(userId: string): Promise<void> {
  await rm(userDir(userId), { recursive: true, force: true });
}
