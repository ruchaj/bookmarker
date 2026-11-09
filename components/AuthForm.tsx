"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/app/auth/actions";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="font-serif text-3xl font-semibold leading-tight">
        {isSignup ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-2 text-muted">
        {isSignup ? "Your library is private to you." : "Welcome back. Your books are where you left them."}
      </p>

      <form action={formAction} className="mt-8 space-y-5">
        {state.error && <p className="alert" role="alert">{state.error}</p>}

        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            className="field"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={state.email}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            className="field"
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            required
            aria-describedby={isSignup ? "password-hint" : undefined}
          />
          {isSignup && <p id="password-hint" className="hint mt-1.5">At least 8 characters.</p>}
        </div>

        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? (isSignup ? "Creating account…" : "Signing in…") : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-[0.9375rem] text-muted">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link className="font-semibold text-cloth underline underline-offset-[3px]" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
