import { aiFailure, fail, readImage, requireUser, spendAiRequest } from "@/lib/api";
import { identifyBook } from "@/lib/ai";

export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("denied" in auth) return auth.denied;

  const photo = readImage(await request.json().catch(() => null));
  if (!photo) return fail(400, "Send a JPEG, PNG or WebP photo under 4.8 MB.");

  const over = await spendAiRequest(auth.supabase);
  if (over) return over;

  try {
    return Response.json(await identifyBook(photo.data, photo.mediaType));
  } catch (error) {
    return aiFailure(error);
  }
}
