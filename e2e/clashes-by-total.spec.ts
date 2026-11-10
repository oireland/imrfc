import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";
import { deleteEquipmentUnits, seedEquipmentUnit } from "./support/equipment";

test("Clashes fire by total count, not just by overlap, once an Equipment Unit is counted", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, equipment, eventA, eventB, listA, listB] = Array.from({ length: 6 }, () => crypto.randomUUID());
  const equipmentName = `Tackle shields ${run}`;
  const titleA = `1st XV v Kings ${run}`;
  const titleB = `2nd XV v UCL ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await seedEquipmentUnit(sql, { id: equipment, name: equipmentName, homeId: store, quantity: 8 });
  // Two overlapping Matches, each asking for 4 of the 8 shields.
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventA}, ${titleA}, 'training', now() + interval '1 hour', now() + interval '3 hours', 'Harlington')`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventB}, ${titleB}, 'training', now() + interval '2 hours', now() + interval '4 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${listA}, 'event', ${eventA})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id, count) values (${crypto.randomUUID()}, ${listA}, ${equipment}, 4)`;
  await sql`insert into checklist (id, scope, scope_id) values (${listB}, 'event', ${eventB})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id, count) values (${crypto.randomUUID()}, ${listB}, ${equipment}, 4)`;

  await signIn(page);

  // Next's dev route announcer is also an alert, so look for the Clashes card itself.
  const clashes = page.getByRole("alert").filter({ hasText: "Clashes" });

  // 4 and 4 of 8 is fine: no Clash on either overlapping Event.
  await page.goto(`/events/${eventA}?tab=kit`);
  await expect(page.getByText(equipmentName).first()).toBeVisible();
  await expect(clashes).toHaveCount(0);
  await page.goto(`/events/${eventB}?tab=kit`);
  await expect(page.getByText(equipmentName).first()).toBeVisible();
  await expect(clashes).toHaveCount(0);

  // Raise one Event's count to 6: between them they now need more than the Quantity.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: `Edit ${equipmentName}` }).click();
  await page.getByLabel(`How many ${equipmentName}?`).selectOption("6");
  await expect(page.getByText(`${equipmentName} ×6`).first()).toBeVisible();

  await page.goto(`/events/${eventA}?tab=kit`);
  await expect(clashes).toBeVisible();
  await expect(clashes).toContainText(
    `${titleA} and ${titleB} need 10 ${equipmentName} between them, but the club only has 8.`,
  );

  await sql`delete from duty where event_id in (${eventA}, ${eventB})`;
  await sql`delete from checklist_item where checklist_id in (${listA}, ${listB})`;
  await sql`delete from checklist where id in (${listA}, ${listB})`;
  await sql`delete from event where id in (${eventA}, ${eventB})`;
  await sql`delete from movement_log_entry where equipment_unit_id = ${equipment}`;
  await deleteEquipmentUnits(sql, [equipment]);
  await sql`delete from store where id = ${store}`;
  await sql.end();
});
