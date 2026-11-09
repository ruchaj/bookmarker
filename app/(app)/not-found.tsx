import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-10">
      <h1 className="font-serif text-3xl font-semibold">This page isn&apos;t here</h1>
      <p className="mt-2 text-muted">The book may have been deleted, or the link is wrong.</p>
      <Link href="/library" className="btn btn-primary mt-6">Go to your library</Link>
    </div>
  );
}
