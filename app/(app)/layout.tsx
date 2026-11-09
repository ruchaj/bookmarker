import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { signOut } from "@/app/auth/actions";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser();

  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3">
          <Wordmark href="/library" />
          <nav className="flex items-center gap-4" aria-label="Main">
            <Link href="/library" className="btn-text inline-flex items-center no-underline hover:underline">
              Library
            </Link>
            <form action={signOut}>
              <button className="btn-text text-muted no-underline hover:underline">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-8">{children}</main>
    </>
  );
}
