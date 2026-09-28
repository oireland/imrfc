import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Unfilled Duties get a heads-up, not a Clash, on the Event and the Kit Unit", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, kit, event, list] = Array.from({ length: 4 }, () => crypto.randomUUID());
  const kitName = `Cones ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into kit_unit (id, name, home_id) values (${kit}, ${kitName}, ${store})`;
  await sql`insert into kit_portion (id, kit_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${kit}, 1, 'store', ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${`Clash training ${run}`}, 'training', now() + interval '1 hour', now() + interval '3 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, kit_unit_id) values (${crypto.randomUUID()}, ${list}, ${kit})`;

  await signIn(page);

  await page.goto(`/events/${event}`);
  const headsUp = `Nobody is taking ${kitName} to or back from Clash training ${run}, and it starts within 48 hours.`;
  // On the Event, the heads-up sits with the kit it is about.
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  await expect(duties.getByText(headsUp)).toBeVisible();
  await expect(duties.getByRole("button", { name: `Bring ${kitName}: nobody yet` })).toContainText("Needs someone");
  await expect(page.getByText("Clashes")).toHaveCount(0);
  // Duty Summary previews the WhatsApp message with the unassigned Kit Unit flagged.
  await expect(page.getByText(`${kitName}: ❗unassigned`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy WhatsApp message" })).toBeVisible();

  await page.goto(`/kit/${kit}`);
  await expect(page.getByRole("region", { name: "Heads up" }).getByText(headsUp)).toBeVisible();
  await sql.end();
});
