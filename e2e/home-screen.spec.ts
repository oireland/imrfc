import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";
import { seedEquipmentUnit } from "./support/equipment";

test("Home shows my Duties, what's coming up and the Equipment I hold", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, equipment, event, list] = Array.from({ length: 4 }, () => crypto.randomUUID());
  const equipmentName = `Tackle shield ${run}`;
  const eventTitle = `Home training ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await seedEquipmentUnit(sql, { id: equipment, name: equipmentName, homeId: store });
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${eventTitle}, 'training', now() + interval '1 hour', now() + interval '3 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${list}, ${equipment})`;

  await signIn(page);

  await page.goto(`/events/${event}?tab=kit`);
  const eventDuties = page.getByRole("region", { name: "Who's bringing what" });
  await eventDuties.getByRole("button", { name: `Bring ${equipmentName}: nobody yet` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "I'll do it" }).click();
  await eventDuties.getByRole("button", { name: `Take back ${equipmentName}: nobody yet` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "I'll do it" }).click();
  await eventDuties.getByRole("button", { name: `Bring ${equipmentName}: you` }).click();
  await page.getByRole("dialog").getByRole("button", { name: /mark as done/ }).click();
  await expect(eventDuties.getByRole("button", { name: `Bring ${equipmentName}: you, done` })).toBeVisible();

  await page.goto("/");
  const duties = page.getByRole("region", { name: "Your duties" });
  const duty = duties.getByRole("link", { name: new RegExp(equipmentName) });
  await expect(duty).toContainText("Take back");
  const comingUp = page.getByRole("region", { name: "What's coming up" });
  await comingUp.getByRole("tab", { name: "agenda" }).click();
  await expect(comingUp.getByRole("link", { name: new RegExp(eventTitle) })).toBeVisible();
  // Home names the first two held Equipment Units, then "& N more" links to the Equipment page.
  await expect(page.getByText("You've got:")).toBeVisible();
  const held = page.getByRole("link", { name: equipmentName, exact: true });
  if ((await held.count()) === 0) {
    await page.getByRole("link", { name: /\d+ more$/ }).click();
    await expect(page.getByRole("region", { name: "With you" }).getByRole("link", { name: equipmentName })).toBeVisible();
  } else {
    await expect(held).toBeVisible();
  }
  await sql.end();
});
