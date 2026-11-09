"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-12">
      <h1 className="font-serif text-2xl font-semibold">That page didn&apos;t load</h1>
      <p className="mt-2 text-muted">{error.message || "Something went wrong on the server."}</p>
      <button className="btn btn-secondary mt-6" onClick={reset}>Try again</button>
    </div>
  );
}
