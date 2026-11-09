import { aiFailure, fail, readImage, requireUser, spendAiRequest } from "@/lib/api";
import { readPagePhoto } from "@/lib/ai";

export const maxDuration = 60;

// Reads a photo of a page and returns the page number and text it found.
// Nothing is saved here: the reader confirms the page first, then the
// saveScan action stores it. The photo itself is never kept.
export async function POST(request: Request, ctx: RouteContext<"/api/books/[id]/scan">) {
  const auth = await requireUser();
  if ("denied" in auth) return auth.denied;

  const { id } = await ctx.params;
  const { data: book } = await auth.supabase.from("books").select("id").eq("id", id).maybeSingle();
  if (!book) return fail(404, "Book not found.");

  const photo = readImage(await request.json().catch(() => null));
  if (!photo) return fail(400, "Send a JPEG, PNG or WebP photo under 4.8 MB.");

  const over = await spendAiRequest(auth.supabase);
  if (over) return over;

  try {
    return Response.json(await readPagePhoto(photo.data, photo.mediaType));
  } catch (error) {
    return aiFailure(error);
  }
}
