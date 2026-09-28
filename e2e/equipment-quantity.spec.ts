import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("A split Equipment Unit shows its count in each Whereabouts group, and moving a portion updates it", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, equipment, teammate] = Array.from({ length: 3 }, () => crypto.randomUUID());
  const equipmentName = `Tackle shields ${run}`;
  const teammateName = `Priya ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into equipment_unit (id, name, home_id, quantity) values (${equipment}, ${equipmentName}, ${store}, 8)`;
  await sql`insert into "user" (id, name, email, access_state) values (${teammate}, ${teammateName}, ${`${run}@example.com`}, 'approved')`;
  // Split across two Places: 5 at the Shed, 3 with a teammate.
  await sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${equipment}, 5, 'store', ${store})`;
  await sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, holder_id) values (${crypto.randomUUID()}, ${equipment}, 3, 'holder', ${teammate})`;

  await signIn(page);

  // The Equipment view shows the split Equipment Unit once per group, each with its count there.
  await page.goto("/equipment");
  await expect(page.getByText(`${equipmentName} ×5`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${equipmentName} ×3`, { exact: true })).toBeVisible();

  // Its detail page shows the whole split.
  await page.goto(`/equipment/${equipment}`);
  const now = page.locator("dd.font-medium");
  await expect(now).toContainText(`5 at Shed ${run}`);
  await expect(now).toContainText(`3 with ${teammateName}`);

  // Taking some of the Shed's portion (from the Equipment view's sheet) moves only that many, leaving the rest alone.
  await page.goto("/equipment");
  await page.getByRole("button", { name: `I've got ${equipmentName} ×5` }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "One fewer" }).click();
  await sheet.getByRole("button", { name: "One fewer" }).click();
  await sheet.getByRole("button", { name: "One fewer" }).click();
  await sheet.getByRole("button", { name: "I've got 2" }).click();
  await expect(page.getByText(`${equipmentName} ×2`, { exact: true })).toBeVisible();
  await page.goto(`/equipment/${equipment}`);
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
  await sql`delete from movement_log_entry where equipment_unit_id = ${equipment}`;
  await sql`delete from equipment_portion where equipment_unit_id = ${equipment}`;
  await sql`delete from equipment_unit where id = ${equipment}`;
  await sql`delete from store where id = ${store}`;
  await sql`delete from "user" where id = ${teammate}`;
  await sql.end();
});
