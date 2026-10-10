import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Unfilled Duties get a heads-up, not a Clash, on the Event and the Equipment Unit", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, equipment, event, list] = Array.from({ length: 4 }, () => crypto.randomUUID());
  const equipmentName = `Cones ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into equipment_unit (id, name, home_id) values (${equipment}, ${equipmentName}, ${store})`;
  await sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${equipment}, 1, 'store', ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${`Clash training ${run}`}, 'training', now() + interval '1 hour', now() + interval '3 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${list}, ${equipment})`;

  await signIn(page);

  await page.goto(`/events/${event}`);
  const headsUp = `Nobody is taking ${equipmentName} to or back from Clash training ${run}, and it starts within 48 hours.`;
  // On the Event, the heads-up sits with the equipment it is about.
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  await expect(duties.getByText(headsUp)).toBeVisible();
  await expect(duties.getByRole("button", { name: `Bring ${equipmentName}: nobody yet` })).toContainText("Needs someone");
  await expect(page.getByText("Clashes")).toHaveCount(0);

  await page.goto(`/equipment/${equipment}`);
  await expect(page.getByRole("region", { name: "Heads up" }).getByText(headsUp)).toBeVisible();
  await sql.end();
});
