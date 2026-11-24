import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";
import { deleteEquipmentUnits, seedEquipmentUnit } from "./support/equipment";

test("Two People join a To Duty, split where it comes from and who ends up with it, and Whereabouts follows", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [shed, equipment, event, list, tom, priya] = Array.from({ length: 6 }, () => crypto.randomUUID());
  const equipmentName = `Tackle shields ${run}`;
  const tomName = `Tom ${run}`;
  const priyaName = `Priya ${run}`;
  await sql`insert into store (id, name, address) values (${shed}, ${`Shed ${run}`}, 'x')`;
  // Split before the To Duty is Confirmed: 2 at the Shed, 2 with Priya (who isn't on the Duty).
  await sql`insert into "user" (id, name, email, access_state) values (${priya}, ${priyaName}, ${`priya-${run}@example.com`}, 'approved')`;
  await sql`insert into "user" (id, name, email, access_state) values (${tom}, ${tomName}, ${`tom-${run}@example.com`}, 'approved')`;
  await seedEquipmentUnit(sql, {
    id: equipment,
    name: equipmentName,
    homeId: shed,
    portions: [
      { count: 2, storeId: shed },
      { count: 2, holderId: priya },
    ],
  });
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${`Shared duty training ${run}`}, 'training', now() + interval '5 days', now() + interval '5 days 2 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${list}, ${equipment})`;

  await signIn(page);

  await page.goto(`/events/${event}?tab=kit`);
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  const sheet = page.getByRole("dialog");

  // The admin joins the To Duty (Claim on an unfilled Duty)...
  await duties.getByRole("button", { name: `Bring ${equipmentName}: nobody yet` }).click();
  await sheet.getByRole("button", { name: "I'll do it" }).click();
  await expect(duties.getByRole("button", { name: `Bring ${equipmentName}: you` })).toBeVisible();

  // ...and Tom joins too (Committee adds him from the multi-select — several People on one Duty).
  await duties.getByRole("button", { name: `Bring ${equipmentName}: you` }).click();
  await sheet.getByRole("button", { name: "Manage who's doing it" }).click();
  const search = sheet.getByLabel("Search people");
  if (await search.count()) await search.fill(run);
  await sheet.getByRole("button", { name: tomName }).click();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(duties.getByRole("button", { name: `Bring ${equipmentName}: You & ${tomName}` })).toBeVisible();

  // Confirming asks where it's coming from (split across the Shed and Priya) and who ends up with it.
  await duties.getByRole("button", { name: `Bring ${equipmentName}: You & ${tomName}` }).click();
  await sheet.getByRole("button", { name: /mark as done/ }).click();
  await expect(sheet).toContainText("Where's it coming from?");
  await expect(sheet).toContainText("Who has how many?");
  await sheet.getByLabel("You", { exact: true }).fill("2");
  await sheet.getByLabel(tomName, { exact: true }).fill("2");
  await sheet.getByRole("button", { name: "Mark as done" }).click();
  await expect(sheet).toBeHidden();
  await expect(duties.getByRole("button", { name: `Bring ${equipmentName}: You & ${tomName}, done` })).toBeVisible();

  // Whereabouts now shows the split between the two of them.
  await page.goto(`/equipment/${equipment}`);
  await expect(page.getByText(`2 with you · 2 with ${tomName}`)).toBeVisible();

  // Test people would otherwise pile up in every person picker on the dev database.
  await sql`delete from duty_user where duty_id in (select id from duty where event_id = ${event})`;
  await sql`delete from duty where event_id = ${event}`;
  await sql`delete from checklist_item where checklist_id = ${list}`;
  await sql`delete from checklist where id = ${list}`;
  await sql`delete from event where id = ${event}`;
  await sql`delete from movement_log_entry where equipment_unit_id = ${equipment}`;
  await deleteEquipmentUnits(sql, [equipment]);
  await sql`delete from store where id in (${shed}, 'Harlington')`;
  await sql`delete from "user" where id in (${tom}, ${priya})`;
  await sql.end();
});
