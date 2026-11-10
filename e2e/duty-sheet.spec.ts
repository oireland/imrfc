import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";
import { deleteEquipmentUnits, seedEquipmentUnit } from "./support/equipment";

test("Committee give a Duty to a teammate and choose where the equipment goes back to, from the Duty sheet", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, otherStore, equipment, event, list, teammate] = Array.from({ length: 6 }, () => crypto.randomUUID());
  const equipmentName = `Tackle shields ${run}`;
  const teammateName = `Tom ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into store (id, name, address) values (${otherStore}, ${`Locker ${run}`}, 'x')`;
  await seedEquipmentUnit(sql, { id: equipment, name: equipmentName, homeId: store });
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${`Sheet training ${run}`}, 'training', now() + interval '5 days', now() + interval '5 days 2 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${list}, ${equipment})`;
  await sql`insert into "user" (id, name, email, access_state) values (${teammate}, ${teammateName}, ${`${run}@example.com`}, 'approved')`;

  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page);

  await page.goto(`/events/${event}?tab=kit`);
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  await expect(duties.getByRole("button", { name: `Bring ${equipmentName}: nobody yet` })).toContainText("Up for grabs");

  await duties.getByRole("button", { name: `Take back ${equipmentName}: nobody yet` }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Manage who's doing it" }).click();
  const results = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  const search = sheet.getByLabel("Search people");
  if (await search.count()) await search.fill(run);
  await sheet.getByRole("button", { name: teammateName }).click();
  await expect(sheet.getByLabel("On it")).toBeVisible(); // toggled on, sheet stays open — several People can be added
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(duties.getByRole("button", { name: `Take back ${equipmentName}: ${teammateName}` })).toBeVisible();

  await duties.getByRole("button", { name: `Take back ${equipmentName}: ${teammateName}` }).click();
  await sheet.getByRole("button", { name: /Goes back to/ }).click();
  await sheet.getByRole("button", { name: `Locker ${run}` }).click();
  await expect(sheet).toBeHidden();
  await duties.getByRole("button", { name: `Take back ${equipmentName}: ${teammateName}` }).click();
  await expect(sheet).toContainText(`Goes back to Locker ${run}`);

  // Test people would otherwise pile up in every person picker on the dev database.
  await sql`delete from duty_user where duty_id in (select id from duty where event_id = ${event})`;
  await sql`delete from duty where event_id = ${event}`;
  await sql`delete from checklist_item where checklist_id = ${list}`;
  await sql`delete from checklist where id = ${list}`;
  await sql`delete from event where id = ${event}`;
  await deleteEquipmentUnits(sql, [equipment]);
  await sql`delete from store where id in (${store}, ${otherStore}, 'Harlington')`;
  await sql`delete from "user" where id = ${teammate}`;
  await sql.end();
});
