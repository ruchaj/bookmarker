import { aiFailure, fail, requireApiUser, spendAiRequest } from "@/lib/api";
import { choosePassage, estimatePosition, searchTerms } from "@/lib/ai";
import { locate } from "@/lib/locate";
import { getBook, searchPassages } from "@/lib/store/library";

export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/books/[id]/locate">) {
  const auth = await requireApiUser(request);
  if ("denied" in auth) return auth.denied;
  const userId = auth.user.id;

  const { id } = await ctx.params;
  const book = await getBook(userId, id);
  if (!book) return fail(404, "Book not found.");

  const body = (await request.json().catch(() => null)) as { description?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length < 8) return fail(400, "Describe the scene in a few more words.");
  if (description.length > 1000) return fail(400, "Keep the description under 1,000 characters.");

  const over = await spendAiRequest(userId);
  if (over) return over;

  try {
    const result = await locate(description, book, {
      hasPassages: book.text_passages + book.scan_pages > 0,
      terms: (d) => searchTerms(d, book),
      search: (query) => searchPassages(userId, book.id, query, 20),
      choose: choosePassage,
      estimate: (d) => estimatePosition(d, book),
    });
    return Response.json(result);
  } catch (error) {
    return aiFailure(error);
  }
}
