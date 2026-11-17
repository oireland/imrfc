import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { user } from "@/features/users";
import { devSignInEnabled } from "@/lib/dev-sign-in";
import { safeNextPath } from "@/lib/next-path";

/**
 * Dev and e2e only: `/api/dev/sign-in?email=…&next=/events` signs in as an existing User
 * without Google or a magic link, so e2e specs can run in parallel. 404 unless DEV_SIGN_IN=1
 * outside production.
 */
export async function GET(request: NextRequest) {
  if (!devSignInEnabled()) return new NextResponse("Not found", { status: 404 });

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  const [found] = email ? await db.select({ id: user.id }).from(user).where(eq(user.email, email)) : [];
  if (!found) return new NextResponse(`No User with email ${email ?? "(none)"}`, { status: 404 });

  const { devAuth } = await import("@/lib/dev-auth");
  const { cookies } = await (await devAuth.$context).test.login({ userId: found.id });

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(next, request.url));
  for (const c of cookies) {
    response.cookies.set(c.name, c.value, { path: c.path, httpOnly: c.httpOnly, secure: c.secure, sameSite: "lax" });
  }
  return response;
}
