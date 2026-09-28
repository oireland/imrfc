import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Anyone can hand an Equipment Unit to a teammate from its page", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, equipment, teammate] = Array.from({ length: 3 }, () => crypto.randomUUID());
  const equipmentName = `First aid equipment ${run}`;
  const teammateName = `Priya ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Locker ${run}`}, 'x')`;
  await sql`insert into equipment_unit (id, name, home_id) values (${equipment}, ${equipmentName}, ${store})`;
  await sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${equipment}, 1, 'store', ${store})`;
  await sql`insert into "user" (id, name, email, access_state) values (${teammate}, ${teammateName}, ${`${run}@example.com`}, 'approved')`;

  await signIn(page);

  await page.goto(`/equipment/${equipment}`);
  await page.getByLabel("Or give it to someone").selectOption({ label: teammateName });
  await page.getByRole("button", { name: "Give", exact: true }).click();

  await expect(page.getByText(`With ${teammateName}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`You gave it to ${teammateName}`)).toBeVisible();

  // Test people would otherwise pile up in every person picker on the dev database.
  await sql`delete from movement_log_entry where equipment_unit_id = ${equipment}`;
  await sql`delete from equipment_portion where equipment_unit_id = ${equipment}`;
  await sql`delete from equipment_unit where id = ${equipment}`;
  await sql`delete from store where id = ${store}`;
  await sql`delete from "user" where id = ${teammate}`;
  await sql.end();
});
