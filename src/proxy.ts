import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// /api/cron routes check their own CRON_SECRET bearer token — Vercel Cron's request never carries a session cookie.
const PUBLIC_PATHS = ["/sign-in", "/api/auth", "/api/feed", "/api/dev/sign-in", "/api/cron"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return NextResponse.next();

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    // Come back here after signing in (e.g. an Event shared in the group chat).
    const signIn = new URL("/sign-in", request.url);
    // A failed sign-in (Better Auth redirects to the callback with ?error=…) must reach the sign-in page, not vanish.
    const rest = new URLSearchParams(request.nextUrl.searchParams);
    for (const key of ["error", "error_description"]) {
      const value = rest.get(key);
      if (value) signIn.searchParams.set(key, value);
      rest.delete(key);
    }
    const restQuery = rest.size ? `?${rest}` : "";
    if (pathname !== "/" || restQuery) signIn.searchParams.set("next", pathname + restQuery);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

// The manifest, service worker and icons must skip the sign-in redirect: browsers fetch them
// without cookies, so a redirect makes Chrome see an invalid manifest and refuse to offer install.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
