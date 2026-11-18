/**
 * Whether `/api/dev/sign-in` may skip Google and magic links: only with DEV_SIGN_IN=1,
 * and never in production or on any Vercel deployment.
 */
export function devSignInEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEV_SIGN_IN === "1" && env.NODE_ENV !== "production" && !env.VERCEL_ENV;
}
