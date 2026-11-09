import Link from "next/link";
import { percentRead } from "@/lib/progress";
import type { Book, ProgressEvent } from "@/lib/types";
import { BookDetails } from "./book/BookDetails";
import { BookText } from "./book/BookText";
import { MarkPage } from "./book/MarkPage";
import { WhereWasI } from "./book/WhereWasI";
import { Cover } from "./Cover";
import { ForeEdge } from "./ForeEdge";
import { LocalDate } from "./LocalDate";

const SOURCE_LABEL: Record<ProgressEvent["source"], string> = {
  manual: "entered by hand",
  photo: "from a photo",
  description: "found from a description",
};

export function BookView({
  book,
  events,
}: {
  book: Book;
  events: ProgressEvent[];
}) {
  const percent = percentRead(book);
  const finished = book.status === "finished";

  return (
    <>
      <Link href="/library" className="text-[0.9375rem] font-semibold text-cloth underline underline-offset-[3px]">
        Back to library
      </Link>

      <header className="mt-5 flex gap-5">
        <Cover book={book} size="md" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[1.75rem] font-semibold leading-tight sm:text-4xl">{book.title}</h1>
          <p className="mt-1 text-lg text-muted">{book.author ?? "Unknown author"}</p>
        </div>
      </header>

      <div className="mt-7 pb-5">
        <ForeEdge percent={percent} finished={finished} large />
      </div>
      <p className="flex flex-wrap justify-between gap-x-4 pb-7 text-[0.9375rem]">
        <span className="font-semibold">
          {finished
            ? "Finished"
            : book.total_pages
              ? `Page ${book.current_page} of ${book.total_pages}`
              : book.current_page > 0
                ? `Page ${book.current_page}`
                : "Not started"}
        </span>
        <span className="text-muted">
          {finished && book.finished_at ? (
            <>on <LocalDate iso={book.finished_at} /></>
          ) : percent != null ? (
            `${percent}% read, ${book.total_pages! - book.current_page} pages to go`
          ) : (
            "Add the number of pages under Book details to see your progress"
          )}
        </span>
      </p>

      <section className="panel" aria-labelledby="mark-title">
        <h2 id="mark-title" className="panel-title">Save your place</h2>
        <MarkPage book={book} />
      </section>

      <section className="panel" aria-labelledby="find-title">
        <h2 id="find-title" className="panel-title">Lost your place?</h2>
        <WhereWasI bookId={book.id} hasText={book.text_passages > 0} scanCount={book.scan_pages} hasLength={Boolean(book.total_pages)} />
      </section>

      <section className="panel" aria-labelledby="text-title">
        <h2 id="text-title" className="panel-title">Book text</h2>
        <BookText bookId={book.id} textName={book.text_name} passageCount={book.text_passages} />
      </section>

      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title" className="panel-title">History</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-muted">Each page you save shows up here.</p>
        ) : (
          <ol className="mt-3 divide-y divide-rule/60">
            {events.map((event) => (
              <li key={event.id} className="flex justify-between gap-4 py-2.5 text-[0.9375rem]">
                <span>
                  <span className="font-semibold">Page {event.page}</span>
                  <span className="text-muted">, {SOURCE_LABEL[event.source]}</span>
                </span>
                <span className="shrink-0 text-muted"><LocalDate iso={event.created_at} /></span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel" aria-labelledby="details-title">
        <h2 id="details-title" className="panel-title">Book details</h2>
        <BookDetails book={book} />
      </section>
    </>
  );
}
