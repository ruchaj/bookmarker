// Who is signed in. The session lives in an HTTP-only cookie holding a random
// token; the matching record is in data/accounts.json.

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createSession, deleteSession, findSessionUser, SESSION_DAYS, type User } from "./store/accounts";

export const SESSION_COOKIE = "bookmarker_session";

/** The signed-in user, or null. Looked up once per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return findSessionUser(token);
});

/** The signed-in user; visitors who aren't signed in are sent to the sign-in page. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const token = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  await deleteSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}
