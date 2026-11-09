"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod/v4";
import { requireUser } from "@/lib/auth";
import { COVER_HOST } from "@/lib/catalog";
import * as library from "@/lib/store/library";
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

function failure(error: unknown, fallback: string): ActionResult {
  if (error instanceof library.NotFoundError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: fallback };
}

function refresh(bookId: string) {
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/library");
}

export async function addBook(input: z.input<typeof NewBook>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = NewBook.safeParse(input);
  if (!parsed.success) return problem(parsed.error);

  let bookId: string;
  try {
    const book = await library.addBook(user.id, {
      ...parsed.data,
      author: parsed.data.author || null,
      isbn: parsed.data.isbn || null,
    });
    bookId = book.id;
  } catch (error) {
    return failure(error, "The book couldn't be saved. Try again.");
  }

  revalidatePath("/library");
  redirect(`/books/${bookId}`);
}

export async function recordProgress(
  bookId: string,
  page: number,
  source: "manual" | "description",
): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(bookId).success || !pageNumber.safeParse(page).success) {
    return { ok: false, error: "Enter a page number." };
  }
  try {
    await library.recordProgress(user.id, bookId, page, source === "description" ? "description" : "manual");
  } catch (error) {
    return failure(error, "Your page couldn't be saved. Try again.");
  }
  refresh(bookId);
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
  const user = await requireUser();
  const parsed = Scan.safeParse(input);
  if (!parsed.success) return problem(parsed.error);
  try {
    await library.saveScan(user.id, parsed.data.bookId, parsed.data.page, parsed.data.pages);
  } catch (error) {
    return failure(error, "Your page couldn't be saved. Try again.");
  }
  refresh(parsed.data.bookId);
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
  const user = await requireUser();
  const parsed = Details.safeParse(input);
  if (!parsed.success) return problem(parsed.error);
  const { bookId, ...fields } = parsed.data;
  try {
    await library.updateBook(user.id, bookId, { ...fields, author: fields.author || null });
  } catch (error) {
    return failure(error, "Your changes couldn't be saved. Try again.");
  }
  refresh(bookId);
  return { ok: true };
}

export async function deleteBook(bookId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!uuid.safeParse(bookId).success) return { ok: false, error: "Book not found." };
  try {
    await library.deleteBook(user.id, bookId);
  } catch (error) {
    return failure(error, "The book couldn't be deleted. Try again.");
  }
  revalidatePath("/library");
  redirect("/library");
}
