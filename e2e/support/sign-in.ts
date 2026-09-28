import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./test-db";

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "irelandoliver4@gmail.com";
export const MAILPIT = "http://localhost:8025";

/**
 * Signs in as an existing User through the dev-only `/api/dev/sign-in` (DEV_SIGN_IN=1),
 * skipping Mailpit so specs can run in parallel. Lands on `next`.
 */
export async function signIn(page: Page, { email = ADMIN_EMAIL, next = "/" }: { email?: string; next?: string } = {}) {
  await page.goto(`/api/dev/sign-in?${new URLSearchParams({ email, next })}`);
  await expect(page).toHaveURL((url) => !url.pathname.startsWith("/api/"));
}

/**
 * The newest magic link Mailpit has for `email`, sent after `after`. Only for specs about
 * the real sign-in flow; give them their own email so parallel runs can't cross links.
 */
export async function magicLink(email: string, after: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)).json();
    const latest = list.messages?.[0];
    if (latest && Date.parse(latest.Created) >= after) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json();
      const match = String(msg.Text).match(/https?:\/\/\S+/);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No magic link email arrived in Mailpit");
}

/**
 * A fresh, approved, onboarded User for a spec that changes per-User state (like the
 * theme) that other specs, signed in as the shared Admin, would trip over. Returns its email.
 */
export async function seedUser({ role = "member" }: { role?: "member" | "committee" | "admin" } = {}): Promise<string> {
  const sql = postgres(TEST_DATABASE_URL);
  const email = `user-${crypto.randomUUID().slice(0, 8)}@example.com`;
  await sql`insert into "user" (id, name, email, email_verified, role, access_state, preferred_position)
    values (${crypto.randomUUID()}, 'E2E User', ${email}, true, ${role}, 'approved', 'Wing')`;
  await sql.end();
  return email;
}
