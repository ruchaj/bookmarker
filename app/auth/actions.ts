"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";

export interface AuthState {
  error?: string;
  notice?: string;
  email?: string;
}

const NOT_SET_UP =
  "This site isn't connected to its database yet. Add the Supabase settings from the README, then restart.";

function credentials(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  };
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!isConfigured) return { error: NOT_SET_UP };
  const { email, password } = credentials(form);
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      email,
      error:
        error.code === "email_not_confirmed"
          ? "Confirm your email first: open the link we sent you, then sign in."
          : "That email and password don't match an account.",
    };
  }
  revalidatePath("/", "layout");
  redirect("/library");
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!isConfigured) return { error: NOT_SET_UP };
  const { email, password } = credentials(form);
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address.", email };
  if (password.length < 8) return { error: "Use a password of at least 8 characters.", email };

  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) {
    return {
      email,
      error:
        error.code === "over_email_send_rate_limit"
          ? "Too many sign-up emails were sent just now. Wait a few minutes and try again."
          : error.code === "weak_password"
            ? "Choose a stronger password."
            : "The account couldn't be created. Try again.",
    };
  }
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/library");
  }
  return { notice: `Check ${email} for a confirmation link, then sign in.` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
