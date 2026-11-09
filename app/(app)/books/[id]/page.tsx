import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookView } from "@/components/BookView";
import { requireUser } from "@/lib/auth";
import { getBook, listEvents } from "@/lib/store/library";

export async function generateMetadata(props: PageProps<"/books/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const book = await getBook(user.id, (await props.params).id);
  return { title: book?.title ?? "Book" };
}

export default async function BookPage(props: PageProps<"/books/[id]">) {
  const user = await requireUser();
  const book = await getBook(user.id, (await props.params).id);
  if (!book) notFound();

  const events = await listEvents(user.id, { bookId: book.id, limit: 30 });
  return <BookView book={book} events={events} />;
}
