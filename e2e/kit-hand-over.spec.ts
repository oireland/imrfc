import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";

const MAILPIT = "http://localhost:8025";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "irelandoliver4@gmail.com";

async function magicLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const match = String(msg.Text).match(/https?:\/\/\S+/);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No magic link email arrived in Mailpit");
}

test("Anyone can hand a Kit Unit to a teammate from its page", async ({ page, baseURL }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, kit, teammate] = Array.from({ length: 3 }, () => crypto.randomUUID());
  const kitName = `First aid kit ${run}`;
  const teammateName = `Priya ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Locker ${run}`}, 'x')`;
  await sql`insert into kit_unit (id, name, home_id) values (${kit}, ${kitName}, ${store})`;
  await sql`insert into kit_portion (id, kit_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${kit}, 1, 'store', ${store})`;
  await sql`insert into "user" (id, name, email, access_state) values (${teammate}, ${teammateName}, ${`${run}@example.com`}, 'approved')`;

  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();

  await page.goto(`/kit/${kit}`);
  await page.getByLabel("Or give it to someone").selectOption({ label: teammateName });
  await page.getByRole("button", { name: "Give", exact: true }).click();

  await expect(page.getByText(`With ${teammateName}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`You gave it to ${teammateName}`)).toBeVisible();

  // Test people would otherwise pile up in every person picker on the dev database.
  await sql`delete from movement_log_entry where kit_unit_id = ${kit}`;
  await sql`delete from kit_portion where kit_unit_id = ${kit}`;
  await sql`delete from kit_unit where id = ${kit}`;
  await sql`delete from store where id = ${store}`;
  await sql`delete from "user" where id = ${teammate}`;
  await sql.end();
});
