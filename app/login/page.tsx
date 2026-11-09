import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { Wordmark } from "@/components/Wordmark";
import { signIn } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page(props: PageProps<"/login">) {
  const confirmed = (await props.searchParams).confirmed === "1";
  return (
    <main className="flex flex-1 flex-col px-5 py-6">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center py-12">
        <AuthForm
          mode="login"
          action={signIn}
          notice={confirmed ? "Your email is confirmed. Sign in to open your library." : undefined}
        />
      </div>
    </main>
  );
}
