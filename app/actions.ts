"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod/v4";
import { COVER_HOST } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const uuid = z.uuid();
const pageNumber = z.number().int().min(0).max(20000);
const totalPages = z.number().int().min(1).max(20000).nullable();
const status = z.enum(["want", "reading", "finished"]);

const NewBook = z.object({
  title: z.string().trim().min(1, "Give the book a title.").max(300),
  author: z.string().trim().max(300).nullable(),
  isbn: z.string().trim().max(20).nullable(),
  cover_url: z.string().max(500).startsWith(COVER_HOST).nullable(),
  total_pages: totalPages,
  status,
});

function problem(error: z.ZodError): ActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Check what you entered." };
}

export async function addBook(input: z.input<typeof NewBook>): Promise<ActionResult> {
  const parsed = NewBook.safeParse(input);
  if (!parsed.success) return problem(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("books")
    .insert({
      ...parsed.data,
      author: parsed.data.author || null,
      isbn: parsed.data.isbn || null,
      finished_at: parsed.data.status === "finished" ? new Date().toISOString() : null,
      current_page: parsed.data.status === "finished" ? (parsed.data.total_pages ?? 0) : 0,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "The book couldn't be saved. Try again." };

  revalidatePath("/library");
  redirect(`/books/${data.id}`);
}

export async function recordProgress(
  bookId: string,
  page: number,
  source: "manual" | "description",
): Promise<ActionResult> {
  if (!uuid.safeParse(bookId).success || !pageNumber.safeParse(page).success) {
    return { ok: false, error: "Enter a page number." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_progress", {
    p_book: bookId,
    p_page: page,
    p_source: source === "description" ? "description" : "manual",
  });
  if (error) return { ok: false, error: "Your page couldn't be saved. Try again." };

  revalidatePath(`/books/${bookId}`);
  revalidatePath("/library");
  return { ok: true };
}

const Scan = z.object({
  bookId: uuid,
  page: pageNumber,
  pages: z
    .array(z.object({ page_number: pageNumber.nullable(), text: z.string().max(20000) }))
    .max(2),
});

/** Save a confirmed page photo: its text becomes searchable and the reader's place moves to it. */
export async function saveScan(input: z.input<typeof Scan>): Promise<ActionResult> {
  const parsed = Scan.safeParse(input);
  if (!parsed.success) return problem(parsed.error);
  const { bookId, page } = parsed.data;

  // With one page in the photo, the confirmed number is that page's number
  // (the reader may have corrected it). With two, it belongs to the later page.
  const pages = parsed.data.pages
    .map((p, i, all) => ({
      text: p.text.trim(),
      page_number: i === all.length - 1 ? page : (p.page_number ?? Math.max(0, page - 1)),
    }))
    .filter((p) => p.text.length > 0);

  const supabase = await createClient();
  if (pages.length > 0) {
    // Re-photographing a page replaces the earlier copy of it.
    await supabase
      .from("passages")
      .delete()
      .eq("book_id", bookId)
      .eq("kind", "scan")
      .in("page_number", pages.map((p) => p.page_number));
    const { error } = await supabase.from("passages").insert(
      pages.map((p) => ({ book_id: bookId, kind: "scan", page_number: p.page_number, content: p.text })),
    );
    if (error) return { ok: false, error: "The page text couldn't be saved. Try again." };
  }

  const { error } = await supabase.rpc("record_progress", { p_book: bookId, p_page: page, p_source: "photo" });
  if (error) return { ok: false, error: "Your page couldn't be saved. Try again." };

  revalidatePath(`/books/${bookId}`);
  revalidatePath("/library");
  return { ok: true };
}

const Details = z.object({
  bookId: uuid,
  title: z.string().trim().min(1, "Give the book a title.").max(300),
  author: z.string().trim().max(300),
  total_pages: totalPages,
  status,
});

export async function updateBook(input: z.input<typeof Details>): Promise<ActionResult> {
  const parsed = Details.safeParse(input);
  if (!parsed.success) return problem(parsed.error);
  const { bookId, ...fields } = parsed.data;

  const supabase = await createClient();
  const { data: book } = await supabase
    .from("books")
    .select("current_page, status, finished_at")
    .eq("id", bookId)
    .maybeSingle();
  if (!book) return { ok: false, error: "Book not found." };

  const { error } = await supabase
    .from("books")
    .update({
      title: fields.title,
      author: fields.author || null,
      total_pages: fields.total_pages,
      status: fields.status,
      current_page: fields.total_pages ? Math.min(book.current_page, fields.total_pages) : book.current_page,
      finished_at:
        fields.status === "finished" ? (book.finished_at ?? new Date().toISOString()) : null,
    })
    .eq("id", bookId);
  if (error) return { ok: false, error: "Your changes couldn't be saved. Try again." };

  revalidatePath(`/books/${bookId}`);
  revalidatePath("/library");
  return { ok: true };
}

export async function deleteBook(bookId: string): Promise<ActionResult> {
  if (!uuid.safeParse(bookId).success) return { ok: false, error: "Book not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) return { ok: false, error: "The book couldn't be deleted. Try again." };

  revalidatePath("/library");
  redirect("/library");
}
