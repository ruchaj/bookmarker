import Link from "next/link";
import { percentRead } from "@/lib/progress";
import type { Book, ProgressEvent } from "@/lib/types";
import { Cover } from "./Cover";
import { ForeEdge } from "./ForeEdge";
import { StatsLine } from "./StatsLine";

function place(book: Book): string {
  if (book.status === "finished") return book.total_pages ? `Finished, ${book.total_pages} pages` : "Finished";
  if (book.status === "want" && book.current_page === 0) {
    return book.total_pages ? `Not started, ${book.total_pages} pages` : "Not started";
  }
  return book.total_pages ? `Page ${book.current_page} of ${book.total_pages}` : `Page ${book.current_page}`;
}

function BookRow({ book }: { book: Book }) {
  const percent = percentRead(book);
  const finished = book.status === "finished";
  return (
    <li>
      <Link
        href={`/books/${book.id}`}
        className="group flex gap-4 rounded-md py-3 outline-offset-4"
      >
        <Cover book={book} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif text-lg font-semibold leading-snug group-hover:underline">
            {book.title}
          </h3>
          <p className="truncate text-[0.9375rem] text-muted">{book.author ?? "Unknown author"}</p>
          <div className="mt-2.5 pb-2">
            <ForeEdge percent={percent} finished={finished} />
          </div>
          <p className="flex justify-between text-sm text-muted">
            <span>{place(book)}</span>
            {!finished && percent != null && <span>{percent}%</span>}
          </p>
        </div>
      </Link>
    </li>
  );
}

function Shelf({ title, books }: { title: string; books: Book[] }) {
  if (books.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="border-b border-rule pb-2 font-serif text-xl font-semibold">
        {title} <span className="font-sans text-sm font-normal text-muted">{books.length}</span>
      </h2>
      <ul className="divide-y divide-rule/60">
        {books.map((book) => (
          <BookRow key={book.id} book={book} />
        ))}
      </ul>
    </section>
  );
}

export function LibraryView({
  books,
  events,
}: {
  books: Book[];
  events: Pick<ProgressEvent, "book_id" | "page" | "created_at">[];
}) {
  const by = (status: Book["status"]) => books.filter((b) => b.status === status);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold leading-tight">Your library</h1>
          {books.length > 0 && (
            <div className="mt-1.5">
              <StatsLine events={events} books={books} />
            </div>
          )}
        </div>
        <Link href="/library/add" className="btn btn-primary">Add a book</Link>
      </div>

      {books.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed border-rule px-6 py-12 text-center">
          <p className="font-serif text-xl font-semibold">Your shelf is empty.</p>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            Add the book you&apos;re reading now, and Bookmarker will keep your place in it.
          </p>
          <Link href="/library/add" className="btn btn-primary mt-6">Add your first book</Link>
        </div>
      ) : (
        <>
          <Shelf title="Reading now" books={by("reading")} />
          <Shelf title="Up next" books={by("want")} />
          <Shelf title="Finished" books={by("finished")} />
        </>
      )}
    </>
  );
}
