import type { Metadata } from "next";
import { LibraryView } from "@/components/LibraryView";
import { requireUser } from "@/lib/auth";
import { listBooks, listEvents } from "@/lib/store/library";

export const metadata: Metadata = { title: "Your library" };

async function loadLibrary(userId: string) {
  // A little over a year of history is enough for the reading stats.
  const since = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
  return Promise.all([listBooks(userId), listEvents(userId, { since })]);
}

export default async function LibraryPage() {
  const user = await requireUser();
  const [books, events] = await loadLibrary(user.id);
  return <LibraryView books={books} events={events} />;
}
