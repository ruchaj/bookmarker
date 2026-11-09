import { NextResponse, type NextRequest } from "next/server";

// A quick first check: visitors with no session cookie are sent to the
// sign-in page before a private page starts rendering. The cookie itself is
// verified where the data is read (lib/auth.ts), so this is a convenience,
// not the lock on the door.
const SESSION_COOKIE = "bookmarker_session";
const PUBLIC_PATHS = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || PUBLIC_PATHS.includes(path) || path.startsWith("/api/");
  if (isPublic || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
