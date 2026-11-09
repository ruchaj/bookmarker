import type { Metadata } from "next";
import { LibraryView } from "@/components/LibraryView";
import { createClient } from "@/lib/supabase/server";
import type { Book } from "@/lib/types";

export const metadata: Metadata = { title: "Your library" };

async function loadLibrary() {
  const supabase = await createClient();
  // A little over a year of history is enough for the reading stats.
  const since = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();

  return Promise.all([
    supabase.from("books").select("*").order("updated_at", { ascending: false }),
    supabase
      .from("progress_events")
      .select("book_id, page, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(3000),
  ]);
}

export default async function LibraryPage() {
  const [books, events] = await loadLibrary();
  if (books.error) throw new Error("Your library couldn't be loaded.");

  return <LibraryView books={(books.data ?? []) as Book[]} events={events.data ?? []} />;
}
