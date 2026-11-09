// Book lookup through Open Library's free search API (no key needed).

import type { CatalogResult } from "./types";

export const COVER_HOST = "https://covers.openlibrary.org/";

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  number_of_pages_median?: number;
  cover_i?: number;
  isbn?: string[];
}

export function mapCatalogDocs(docs: OpenLibraryDoc[]): CatalogResult[] {
  return docs
    .filter((d) => d.key && d.title)
    .map((d) => ({
      key: d.key as string,
      title: (d.title as string).slice(0, 300),
      author: d.author_name?.slice(0, 3).join(", ").slice(0, 300) || null,
      year: d.first_publish_year ?? null,
      pages:
        d.number_of_pages_median && d.number_of_pages_median > 0 && d.number_of_pages_median <= 20000
          ? Math.round(d.number_of_pages_median)
          : null,
      isbn: d.isbn?.find((i) => i.length === 13) ?? d.isbn?.[0] ?? null,
      cover_url: d.cover_i ? `${COVER_HOST}b/id/${d.cover_i}-M.jpg` : null,
    }));
}

export async function searchCatalog(query: string): Promise<CatalogResult[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set(
    "fields",
    "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn",
  );

  const response = await fetch(url, {
    headers: { "User-Agent": "Bookmarker reading tracker (self-hosted)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Open Library answered ${response.status}`);
  const body = (await response.json()) as { docs?: OpenLibraryDoc[] };
  return mapCatalogDocs(body.docs ?? []);
}
