import Link from "next/link";

/** The site name, with a page corner folded down beside it. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-serif text-xl font-semibold tracking-tight">
      <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true">
        <path d="M1 1h10l6 6v14H1z" fill="var(--color-sheet)" stroke="var(--color-cloth)" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M11 1v6h6z" fill="var(--color-ribbon)" stroke="var(--color-ribbon)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      Bookmarker
    </Link>
  );
}
