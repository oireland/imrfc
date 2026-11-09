import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("an Admin can't delete an Event while equipment was last seen there", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, equipment, event] = Array.from({ length: 3 }, () => crypto.randomUUID());
  const eventTitle = `Training ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${eventTitle}, 'training', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'Harlington')`;
  await sql`insert into equipment_unit (id, name, home_id) values (${equipment}, ${`Ball bag ${run}`}, ${store})`;
  await sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, last_seen_event_id)
    values (${crypto.randomUUID()}, ${equipment}, 1, 'unconfirmed', ${event})`;

  await signIn(page, { next: `/events/${event}` });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete event" }).click();

  await expect(page.getByText("Some equipment was last seen at this event.")).toBeVisible();
  const [row] = await sql`select id from event where id = ${event}`;
  expect(row).toBeDefined();
  await sql.end();
});
