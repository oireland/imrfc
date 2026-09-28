import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Committee claims and Confirms Duties, and the Equipment Unit follows", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, equipment, event, list] = Array.from({ length: 4 }, () => crypto.randomUUID());
  const storeName = `Shed ${run}`;
  const equipmentName = `Ball bag ${run}`;
  const eventTitle = `Training ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${storeName}, 'x')`;
  await sql`insert into equipment_unit (id, name, home_id) values (${equipment}, ${equipmentName}, ${store})`;
  await sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${equipment}, 1, 'store', ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${eventTitle}, 'training', now() + interval '1 day', now() + interval '1 day 2 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${list}, ${equipment})`;

  await signIn(page);

  await page.goto(`/events/${event}`);
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  await duties.getByRole("button", { name: `Bring ${equipmentName}: nobody yet` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "I'll do it" }).click(); // To Duty; From follows
  await expect(duties.getByRole("button", { name: `Take back ${equipmentName}: you` })).toBeVisible();
  await duties.getByRole("button", { name: `Bring ${equipmentName}: you` }).click();
  await page.getByRole("dialog").getByRole("button", { name: /mark as done/ }).click();
  await expect(duties.getByRole("button", { name: `Bring ${equipmentName}: you, done` })).toBeVisible();
  await expect(duties).toContainText("1 of 2 done");

  await page.goto("/equipment");
  const held = page.getByRole("region", { name: "With you" }).getByRole("link", { name: equipmentName });
  await expect(held.first()).toBeVisible();

  await page.goto(`/events/${event}`);
  await duties.getByRole("button", { name: `Take back ${equipmentName}: you` }).click(); // Destination Home
  await page.getByRole("dialog").getByRole("button", { name: /mark as done/ }).click();
  await expect(duties).toContainText("2 of 2 done");

  await page.goto("/equipment");
  const home = page.getByRole("region", { name: storeName }).getByRole("link", { name: equipmentName });
  await expect(home.first()).toBeVisible();
  await sql.end();
});
