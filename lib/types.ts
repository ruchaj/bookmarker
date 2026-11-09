export type BookStatus = "want" | "reading" | "finished";
export type ProgressSource = "manual" | "photo" | "description";

export interface Book {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  cover_url: string | null;
  total_pages: number | null;
  current_page: number;
  status: BookStatus;
  text_name: string | null;
  text_chars: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface ProgressEvent {
  id: string;
  book_id: string;
  page: number;
  source: ProgressSource;
  created_at: string;
}

export interface CatalogResult {
  key: string;
  title: string;
  author: string | null;
  year: number | null;
  pages: number | null;
  isbn: string | null;
  cover_url: string | null;
}

/** One page read from a photo. */
export interface ScannedPage {
  page_number: number | null;
  text: string;
}

export interface ScanResult {
  is_book_page: boolean;
  pages: ScannedPage[];
}

export interface IdentifyResult {
  found: boolean;
  title: string | null;
  author: string | null;
  isbn: string | null;
}

/** Answer to "where was I?" */
export interface LocateResult {
  /** 'text' = found in imported text, 'scan' = found in a photographed page,
   *  'estimate' = the AI's recollection of the book, 'none' = no answer. */
  kind: "text" | "scan" | "estimate" | "none";
  page: number | null;
  /** Position through the book, 0–100. */
  percent: number | null;
  chapter: string | null;
  confidence: "high" | "medium" | "low";
  /** A short stretch of the matched passage, for the reader to recognise. */
  snippet: string | null;
  note: string | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };
