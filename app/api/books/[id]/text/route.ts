import * as z from "zod/v4";
import { fail, requireApiUser } from "@/lib/api";
import { NotFoundError, removeText, replaceText } from "@/lib/store/library";

// The browser reads the EPUB or text file, splits it into passages, and
// sends them here to be saved as the book's searchable text.
const Upload = z.object({
  name: z.string().trim().min(1).max(300),
  chunks: z
    .array(
      z.object({
        idx: z.number().int().min(0),
        chapter: z.string().max(300).nullable(),
        start_pct: z.number().min(0).max(1),
        end_pct: z.number().min(0).max(1),
        content: z.string().min(1).max(20000),
      }),
    )
    .min(1)
    .max(8000),
});

const MAX_BODY_BYTES = 30 * 1024 * 1024;

export async function PUT(request: Request, ctx: RouteContext<"/api/books/[id]/text">) {
  const auth = await requireApiUser(request);
  if ("denied" in auth) return auth.denied;
  const { id } = await ctx.params;

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail(413, "That book's text is too large to import.");
  }
  const parsed = Upload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "The book's text wasn't in the expected form. Import the file again.");

  try {
    const saved = await replaceText(auth.user.id, id, parsed.data.name, parsed.data.chunks);
    return Response.json({ passages: saved });
  } catch (error) {
    if (error instanceof NotFoundError || (error as Error).message === "Invalid id") return fail(404, "Book not found.");
    console.error(error);
    return fail(500, "The text couldn't be saved. Try again.");
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/books/[id]/text">) {
  const auth = await requireApiUser(request);
  if ("denied" in auth) return auth.denied;
  const { id } = await ctx.params;

  try {
    await removeText(auth.user.id, id);
    return Response.json({ passages: 0 });
  } catch (error) {
    if (error instanceof NotFoundError || (error as Error).message === "Invalid id") return fail(404, "Book not found.");
    console.error(error);
    return fail(500, "The saved text couldn't be removed. Try again.");
  }
}
