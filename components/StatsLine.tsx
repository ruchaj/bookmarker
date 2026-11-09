"use client";

import { readingStats } from "@/lib/progress";
import type { Book, ProgressEvent } from "@/lib/types";
import { useIsClient } from "./LocalDate";

/** One sentence summing up recent reading, counted in the reader's own time zone. */
export function StatsLine({
  events,
  books,
}: {
  events: Pick<ProgressEvent, "book_id" | "page" | "created_at">[];
  books: Pick<Book, "status" | "finished_at">[];
}) {
  const isClient = useIsClient();
  if (!isClient) return <p className="min-h-6 text-muted" />;

  const { pagesThisWeek, streakDays, finishedThisYear } = readingStats(events, books);
  const n = (value: number) => <strong className="font-semibold text-ink">{value.toLocaleString()}</strong>;
  const parts: React.ReactNode[] = [];

  if (pagesThisWeek > 0) {
    parts.push(<>{n(pagesThisWeek)} {pagesThisWeek === 1 ? "page" : "pages"} in the last 7 days</>);
  }
  if (streakDays > 1) parts.push(<>{n(streakDays)} days in a row</>);
  if (finishedThisYear > 0) {
    parts.push(<>{n(finishedThisYear)} {finishedThisYear === 1 ? "book" : "books"} finished this year</>);
  }

  if (parts.length === 0) {
    return <p className="min-h-6 text-muted">No pages logged in the last 7 days.</p>;
  }
  return (
    <p className="min-h-6 text-muted">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (i === parts.length - 1 ? " and " : ", ")}
          {part}
        </span>
      ))}
      .
    </p>
  );
}
