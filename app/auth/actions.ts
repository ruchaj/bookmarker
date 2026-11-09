"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth";
import { createUser, EmailTakenError, normalizeEmail, verifyLogin } from "@/lib/store/accounts";

export interface AuthState {
  error?: string;
  email?: string;
}

function credentials(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim().slice(0, 254),
    password: String(form.get("password") ?? "").slice(0, 200),
  };
}

// Slows down password guessing: a few wrong tries per email, then a wait.
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;
type Failures = Map<string, { count: number; until: number }>;
const globals = globalThis as typeof globalThis & { __bookmarkerFailures?: Failures };
const failures: Failures = (globals.__bookmarkerFailures ??= new Map());

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const { email, password } = credentials(form);
  if (!email || !password) return { error: "Enter your email and password.", email };

  const key = normalizeEmail(email);
  const record = failures.get(key);
  if (record && record.until < Date.now()) failures.delete(key);
  if ((failures.get(key)?.count ?? 0) >= MAX_FAILURES) {
    return { email, error: `Too many wrong passwords. Wait ${LOCK_MINUTES} minutes and try again.` };
  }

  const user = await verifyLogin(email, password);
  if (!user) {
    const count = (failures.get(key)?.count ?? 0) + 1;
    failures.set(key, { count, until: Date.now() + LOCK_MINUTES * 60_000 });
    return { email, error: "That email and password don't match an account." };
  }

  failures.delete(key);
  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect("/library");
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (process.env.ALLOW_SIGNUPS === "false") {
    return { error: "New accounts are closed on this site. Ask its owner for access." };
  }
  const { email, password } = credentials(form);
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address.", email };
  if (password.length < 8) return { error: "Use a password of at least 8 characters.", email };

  let userId: string;
  try {
    userId = (await createUser(email, password)).id;
  } catch (error) {
    if (error instanceof EmailTakenError) return { email, error: error.message };
    console.error(error);
    return { email, error: "The account couldn't be created. Try again." };
  }

  await startSession(userId);
  revalidatePath("/", "layout");
  redirect("/library");
}

export async function signOut() {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}
