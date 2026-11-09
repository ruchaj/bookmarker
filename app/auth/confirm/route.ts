import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the link in the sign-up email. Handles both link styles
// Supabase can send: ?code=… (the default) and ?token_hash=…&type=….
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let confirmed = false;
  if (code) {
    confirmed = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    confirmed = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  const url = request.nextUrl.clone();
  url.search = "";
  if (confirmed) {
    url.pathname = "/library";
  } else {
    // Usually the link was opened in a different browser from the one used
    // to sign up. The email is confirmed all the same; signing in works.
    url.pathname = "/login";
    url.searchParams.set("confirmed", "1");
  }
  return NextResponse.redirect(url);
}
