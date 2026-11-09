import Link from "next/link";
import { redirect } from "next/navigation";
import { ForeEdge } from "@/components/ForeEdge";
import { Wordmark } from "@/components/Wordmark";
import { isConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  if (isConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect("/library");
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-20">
      <header className="flex items-center justify-between py-6">
        <Wordmark />
        <Link href="/login" className="btn-text inline-flex items-center">Sign in</Link>
      </header>

      {!isConfigured && (
        <p className="alert mb-6" role="alert">
          This site isn&apos;t connected to its database yet. Follow the setup steps in the README,
          then restart the server.
        </p>
      )}

      <section className="grid items-center gap-12 pt-8 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div>
          <h1 className="font-serif text-[2.5rem] font-semibold leading-[1.1] tracking-tight sm:text-[3.25rem]">
            Pick up exactly where you left off.
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg text-muted">
            Bookmarker keeps your place in every book you&apos;re reading. Photograph the page to save it. And
            if you lose your place, describe the last thing you remember and it finds the page.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">Create an account</Link>
            <Link href="/login" className="btn btn-secondary">Sign in</Link>
          </div>
        </div>

        {/* A worked example of the feature the site is built around. */}
        <figure className="rounded-lg border border-rule bg-sheet p-6 sm:p-7">
          <figcaption className="text-sm text-muted">An example, with Pride and Prejudice</figcaption>
          <p className="mt-4 text-sm font-semibold">The last thing you remember</p>
          <p className="mt-1.5 rounded-md bg-wash px-3.5 py-3 text-[0.9375rem]">
            Elizabeth had just walked three miles through the mud to see her sister at Netherfield.
          </p>
          <p className="mt-6 text-sm font-semibold">Where that is</p>
          <p className="mt-1 font-serif text-4xl font-semibold leading-tight">Page 34</p>
          <p className="text-[0.9375rem] text-muted">Chapter 7, about a tenth of the way in</p>
          <div className="mt-5 pb-3">
            <ForeEdge percent={10} large />
          </div>
        </figure>
      </section>

      <section className="mt-20 grid gap-10 border-t border-rule pt-10 md:grid-cols-3">
        <div>
          <h2 className="font-serif text-xl font-semibold">Save your place with a photo</h2>
          <p className="mt-2 text-muted">
            Snap the page you stopped on. Bookmarker reads the page number and updates your progress.
          </p>
        </div>
        <div>
          <h2 className="font-serif text-xl font-semibold">Find your page from memory</h2>
          <p className="mt-2 text-muted">
            Forgot to mark it? Describe the scene in your own words. Bookmarker searches the book&apos;s text
            and the pages you&apos;ve photographed, and shows you the passage to confirm.
          </p>
        </div>
        <div>
          <h2 className="font-serif text-xl font-semibold">See every book at a glance</h2>
          <p className="mt-2 text-muted">
            What you&apos;re reading, what&apos;s next and what you&apos;ve finished, each with a marker
            showing how far in you are.
          </p>
        </div>
      </section>
    </main>
  );
}
