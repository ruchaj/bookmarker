import type { Book } from "@/lib/types";

// Books without a cover image get a plain cloth binding in one of four colours.
const CLOTHS = ["#1f4a3d", "#27405e", "#6e2a35", "#7a5a1e"];

function clothFor(title: string): string {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return CLOTHS[hash % CLOTHS.length];
}

export function Cover({
  book,
  size = "sm",
}: {
  book: Pick<Book, "title" | "cover_url">;
  size?: "sm" | "md";
}) {
  const box = size === "md" ? "h-36 w-24" : "h-[5.25rem] w-14";

  if (book.cover_url) {
    return (
      // Covers come straight from Open Library; next/image would only add a proxy hop.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={book.cover_url}
        alt=""
        loading="lazy"
        className={`${box} shrink-0 rounded-[3px] bg-wash object-cover shadow-[0_1px_2px_rgba(23,35,31,0.25)]`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${box} flex shrink-0 items-end overflow-hidden rounded-[3px] p-1.5 shadow-[0_1px_2px_rgba(23,35,31,0.25)]`}
      style={{ background: clothFor(book.title) }}
    >
      <span
        className={`line-clamp-5 hyphens-auto font-serif font-semibold leading-tight text-[#f3ecd8] [overflow-wrap:anywhere] ${size === "md" ? "text-xs" : "text-[0.5rem]"}`}
      >
        {book.title}
      </span>
    </div>
  );
}
