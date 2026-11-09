import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { Wordmark } from "@/components/Wordmark";
import { signIn } from "@/app/auth/actions";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page() {
  if (await getUser()) redirect("/library");
  return (
    <main className="flex flex-1 flex-col px-5 py-6">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center py-12">
        <AuthForm mode="login" action={signIn} />
      </div>
    </main>
  );
}
