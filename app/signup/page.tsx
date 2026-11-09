import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { Wordmark } from "@/components/Wordmark";
import { signUp } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Create account" };

export default async function Page(props: PageProps<"/signup">) {
  const confirmed = (await props.searchParams).confirmed === "1";
  return (
    <main className="flex flex-1 flex-col px-5 py-6">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center py-12">
        <AuthForm
          mode="signup"
          action={signUp}
          notice={confirmed ? "Your email is confirmed. Sign in to open your library." : undefined}
        />
      </div>
    </main>
  );
}
