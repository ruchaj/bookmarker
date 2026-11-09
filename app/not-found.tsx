import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
      <Wordmark />
      <h1 className="mt-16 font-serif text-3xl font-semibold">This page isn&apos;t here</h1>
      <p className="mt-2 text-muted">Check the address, or head back to your library.</p>
      <Link href="/library" className="btn btn-primary mt-6">Go to your library</Link>
    </main>
  );
}
