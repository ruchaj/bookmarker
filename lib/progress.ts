import type { Book, ProgressEvent } from "./types";

/** How far through a book the reader is, 0–100, or null when the length is unknown. */
export function percentRead(book: Pick<Book, "current_page" | "total_pages" | "status">): number | null {
  if (!book.total_pages) return book.status === "finished" ? 100 : null;
  return Math.max(0, Math.min(100, Math.round((book.current_page / book.total_pages) * 100)));
}

/** Convert a position through the book (0–1) into a page in the reader's edition. */
export function pageFromFraction(fraction: number, totalPages: number | null): number | null {
  if (!totalPages) return null;
  return Math.max(1, Math.min(totalPages, Math.round(fraction * totalPages)));
}

export function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface ReadingStats {
  pagesThisWeek: number;
  streakDays: number;
  finishedThisYear: number;
}

/**
 * Reading stats in the viewer's own time zone. Pages read are the forward
 * steps between a book's consecutive updates; going back a page counts as zero.
 */
export function readingStats(
  events: Pick<ProgressEvent, "book_id" | "page" | "created_at">[],
  books: Pick<Book, "status" | "finished_at">[],
  now: Date = new Date(),
): ReadingStats {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastPage = new Map<string, number>();
  const pagesByDay = new Map<string, number>();

  for (const event of sorted) {
    const gained = Math.max(0, event.page - (lastPage.get(event.book_id) ?? 0));
    lastPage.set(event.book_id, event.page);
    if (gained > 0) {
      const day = localDay(new Date(event.created_at));
      pagesByDay.set(day, (pagesByDay.get(day) ?? 0) + gained);
    }
  }

  const dayAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return localDay(d);
  };

  let pagesThisWeek = 0;
  for (let i = 0; i < 7; i++) pagesThisWeek += pagesByDay.get(dayAgo(i)) ?? 0;

  // A streak survives until the end of today: start from yesterday if today is still empty.
  let streakDays = 0;
  let i = pagesByDay.has(dayAgo(0)) ? 0 : 1;
  while (pagesByDay.has(dayAgo(i))) {
    streakDays++;
    i++;
  }

  const year = now.getFullYear();
  const finishedThisYear = books.filter(
    (b) => b.status === "finished" && b.finished_at && new Date(b.finished_at).getFullYear() === year,
  ).length;

  return { pagesThisWeek, streakDays, finishedThisYear };
}
