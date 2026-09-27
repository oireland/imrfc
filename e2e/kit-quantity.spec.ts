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

test("A split Kit Unit shows its count in each Whereabouts group, and moving a portion updates it", async ({ page, baseURL }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, kit, teammate] = Array.from({ length: 3 }, () => crypto.randomUUID());
  const kitName = `Tackle shields ${run}`;
  const teammateName = `Priya ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into kit_unit (id, name, home_id, quantity) values (${kit}, ${kitName}, ${store}, 8)`;
  await sql`insert into "user" (id, name, email, access_state) values (${teammate}, ${teammateName}, ${`${run}@example.com`}, 'approved')`;
  // Split across two Places: 5 at the Shed, 3 with a teammate.
  await sql`insert into kit_portion (id, kit_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${kit}, 5, 'store', ${store})`;
  await sql`insert into kit_portion (id, kit_unit_id, count, whereabouts_type, holder_id) values (${crypto.randomUUID()}, ${kit}, 3, 'holder', ${teammate})`;

  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();

  // The Kit view shows the split Kit Unit once per group, each with its count there.
  await page.goto("/kit");
  await expect(page.getByText(`${kitName} ×5`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${kitName} ×3`, { exact: true })).toBeVisible();

  // Its detail page shows the whole split.
  await page.goto(`/kit/${kit}`);
  const now = page.locator("dd.font-medium");
  await expect(now).toContainText(`5 at Shed ${run}`);
  await expect(now).toContainText(`3 with ${teammateName}`);

  // Taking some of the Shed's portion (from the Kit view's sheet) moves only that many, leaving the rest alone.
  await page.goto("/kit");
  await page.getByRole("button", { name: `I've got ${kitName} ×5` }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "One fewer" }).click();
  await sheet.getByRole("button", { name: "One fewer" }).click();
  await sheet.getByRole("button", { name: "One fewer" }).click();
  await sheet.getByRole("button", { name: "I've got 2" }).click();
  await expect(page.getByText(`${kitName} ×2`, { exact: true })).toBeVisible();
  await page.goto(`/kit/${kit}`);
  const after = page.locator("dd.font-medium");
  await expect(after).toContainText(`3 at Shed ${run}`);
  await expect(after).toContainText("2 with you");
  await expect(after).toContainText(`3 with ${teammateName}`);

  // On the detail page, the count sits beside the button: take 1 more of the Shed's 3.
  const shedPortion = page.locator("div.rounded-2xl", { has: page.getByText(`3 in Shed ${run}`, { exact: true }) });
  await shedPortion.getByRole("spinbutton", { name: "How many" }).first().fill("1");
  await shedPortion.getByRole("button", { name: "I've got 1" }).click();
  await expect(page.locator("dd.font-medium")).toContainText("2 at Shed");
  await expect(page.locator("dd.font-medium")).toContainText("3 with you");

  // Test people would otherwise pile up in every person picker on the dev database.
  await sql`delete from movement_log_entry where kit_unit_id = ${kit}`;
  await sql`delete from kit_portion where kit_unit_id = ${kit}`;
  await sql`delete from kit_unit where id = ${kit}`;
  await sql`delete from store where id = ${store}`;
  await sql`delete from "user" where id = ${teammate}`;
  await sql.end();
});
