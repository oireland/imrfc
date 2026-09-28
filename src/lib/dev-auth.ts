import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { testUtils } from "better-auth/plugins";
import { db } from "@/db/client";
import { account, session, user, verification } from "@/features/users/schema";

/**
 * A second Better Auth instance with the test-utils plugin, kept out of the real config
 * as Better Auth advises. Same database and secret, so the sessions it makes are real.
 * Only `/api/dev/sign-in` loads it, and only when `devSignInEnabled()`.
 */
export const devAuth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
  plugins: [testUtils()],
});
