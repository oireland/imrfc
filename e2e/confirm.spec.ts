import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Committee claims and Confirms Duties, and the Kit Unit follows", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, kit, event, list] = Array.from({ length: 4 }, () => crypto.randomUUID());
  const storeName = `Shed ${run}`;
  const kitName = `Ball bag ${run}`;
  const eventTitle = `Training ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${storeName}, 'x')`;
  await sql`insert into kit_unit (id, name, home_id) values (${kit}, ${kitName}, ${store})`;
  await sql`insert into kit_portion (id, kit_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${kit}, 1, 'store', ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${eventTitle}, 'training', now() + interval '1 day', now() + interval '1 day 2 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, kit_unit_id) values (${crypto.randomUUID()}, ${list}, ${kit})`;

  await signIn(page);

  await page.goto(`/events/${event}`);
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  await duties.getByRole("button", { name: `Bring ${kitName}: nobody yet` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "I'll do it" }).click(); // To Duty; From follows
  await expect(duties.getByRole("button", { name: `Take back ${kitName}: you` })).toBeVisible();
  await duties.getByRole("button", { name: `Bring ${kitName}: you` }).click();
  await page.getByRole("dialog").getByRole("button", { name: /mark as done/ }).click();
  await expect(duties.getByRole("button", { name: `Bring ${kitName}: you, done` })).toBeVisible();
  await expect(duties).toContainText("1 of 2 done");

  await page.goto("/kit");
  const held = page.getByRole("region", { name: "With you" }).getByRole("link", { name: kitName });
  await expect(held.first()).toBeVisible();

  await page.goto(`/events/${event}`);
  await duties.getByRole("button", { name: `Take back ${kitName}: you` }).click(); // Destination Home
  await page.getByRole("dialog").getByRole("button", { name: /mark as done/ }).click();
  await expect(duties).toContainText("2 of 2 done");

  await page.goto("/kit");
  const home = page.getByRole("region", { name: storeName }).getByRole("link", { name: kitName });
  await expect(home.first()).toBeVisible();
  await sql.end();
});
