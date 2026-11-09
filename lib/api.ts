// Shared helpers for the API routes.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AiNotConfiguredError, type ImageType } from "./ai";
import { getUser } from "./auth";
import { bumpAiUsage } from "./store/library";

export function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * The signed-in user, or a response to send back instead. Requests that
 * change something must also come from this site's own pages.
 */
export async function requireApiUser(request: Request) {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return { denied: fail(403, "This request didn't come from the site.") } as const;
    }
  }
  const user = await getUser();
  if (!user) return { denied: fail(401, "Sign in to continue.") } as const;
  return { user } as const;
}

const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 60);

/** Counts one AI request against the user's daily allowance. Returns a response if they are over it. */
export async function spendAiRequest(userId: string): Promise<Response | null> {
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, new AiNotConfiguredError().message);
  const used = await bumpAiUsage(userId);
  if (used > DAILY_LIMIT) {
    return fail(429, `You've used today's ${DAILY_LIMIT} AI requests. They reset at midnight UTC.`);
  }
  return null;
}

const IMAGE_TYPES: ImageType[] = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BASE64 = 6_500_000; // about 4.8 MB of image

export function readImage(body: unknown): { data: string; mediaType: ImageType } | null {
  if (!body || typeof body !== "object") return null;
  const { image, mediaType } = body as { image?: unknown; mediaType?: unknown };
  if (typeof image !== "string" || image.length === 0 || image.length > MAX_IMAGE_BASE64) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(image)) return null;
  if (!IMAGE_TYPES.includes(mediaType as ImageType)) return null;
  return { data: image, mediaType: mediaType as ImageType };
}

export function aiFailure(error: unknown): Response {
  if (error instanceof AiNotConfiguredError) return fail(503, error.message);
  if (error instanceof Anthropic.APIError) {
    console.error("Claude API error", error.status, error.message);
    if (error.status === 401) return fail(503, "The server's ANTHROPIC_API_KEY was rejected.");
    if (error.status === 429 || error.status === 529) return fail(503, "The AI is busy right now. Try again in a moment.");
    return fail(502, "The AI request failed. Try again.");
  }
  console.error(error);
  return fail(502, error instanceof Error ? error.message : "The AI request failed. Try again.");
}
