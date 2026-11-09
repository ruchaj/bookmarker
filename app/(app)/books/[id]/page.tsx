import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookView } from "@/components/BookView";
import { createClient } from "@/lib/supabase/server";
import type { Book, ProgressEvent } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(props: PageProps<"/books/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  if (!UUID.test(id)) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("books").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Book" };
}

export default async function BookPage(props: PageProps<"/books/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const count = (kind: "text" | "scan") =>
    supabase.from("passages").select("id", { count: "exact", head: true }).eq("book_id", id).eq("kind", kind);

  const [book, events, text, scans] = await Promise.all([
    supabase.from("books").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("progress_events")
      .select("id, book_id, page, source, created_at")
      .eq("book_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    count("text"),
    count("scan"),
  ]);
  if (!book.data) notFound();

  return (
    <BookView
      book={book.data as Book}
      events={(events.data ?? []) as ProgressEvent[]}
      textPassages={text.count ?? 0}
      scanCount={scans.count ?? 0}
    />
  );
}
