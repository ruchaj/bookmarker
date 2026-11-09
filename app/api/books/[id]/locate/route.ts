import { aiFailure, fail, requireUser, spendAiRequest } from "@/lib/api";
import { choosePassage, estimatePosition, searchTerms } from "@/lib/ai";
import { locate, type PassageHit } from "@/lib/locate";

export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/books/[id]/locate">) {
  const auth = await requireUser();
  if ("denied" in auth) return auth.denied;
  const { supabase } = auth;

  const { id } = await ctx.params;
  const { data: book } = await supabase
    .from("books")
    .select("id, title, author, total_pages")
    .eq("id", id)
    .maybeSingle();
  if (!book) return fail(404, "Book not found.");

  const body = (await request.json().catch(() => null)) as { description?: unknown } | null;
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length < 8) return fail(400, "Describe the scene in a few more words.");
  if (description.length > 1000) return fail(400, "Keep the description under 1,000 characters.");

  const over = await spendAiRequest(supabase);
  if (over) return over;

  const { count } = await supabase
    .from("passages")
    .select("id", { count: "exact", head: true })
    .eq("book_id", id);

  try {
    const result = await locate(description, book, {
      hasPassages: (count ?? 0) > 0,
      terms: (d) => searchTerms(d, book),
      search: async (query) => {
        const { data, error } = await supabase.rpc("search_passages", {
          p_book: id,
          p_query: query,
          p_limit: 20,
        });
        if (error) throw new Error("Searching this book's text failed.");
        return (data ?? []) as PassageHit[];
      },
      choose: choosePassage,
      estimate: (d) => estimatePosition(d, book),
    });
    return Response.json(result);
  } catch (error) {
    return aiFailure(error);
  }
}
