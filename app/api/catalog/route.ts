import type { NextRequest } from "next/server";
import { fail, requireApiUser } from "@/lib/api";
import { searchCatalog } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ("denied" in auth) return auth.denied;

  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (q.length < 2) return Response.json({ results: [] });

  try {
    return Response.json({ results: await searchCatalog(q) });
  } catch (error) {
    console.error(error);
    return fail(502, "The book catalog didn't answer. Try again, or enter the book yourself.");
  }
}
