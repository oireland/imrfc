import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Committee add to, change and take things off an Event's kit list without losing the rest of it", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [shed, bibs, cones, flags, series, event, seriesList, tom, tape] = Array.from({ length: 9 }, () => crypto.randomUUID());
  const [bibsName, conesName, flagsName, tomName, tapeName] = [`Bibs ${run}`, `Cones ${run}`, `Flags ${run}`, `Tom ${run}`, `Tape ${run}`];
  await sql`insert into store (id, name, address) values (${shed}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into equipment_unit (id, name, home_id) values (${bibs}, ${bibsName}, ${shed})`;
  await sql`insert into equipment_unit (id, name, home_id, quantity) values (${cones}, ${conesName}, ${shed}, 4)`;
  await sql`insert into equipment_unit (id, name, home_id) values (${flags}, ${flagsName}, ${shed})`;
  await sql`insert into equipment_unit (id, name, home_id, quantity) values (${tape}, ${tapeName}, ${shed}, 3)`;
  await sql`insert into series (id, title, event_type, weekdays, start_time, end_time, venue, start_date, end_date)
    values (${series}, ${`Kit series ${run}`}, 'training', '{1}', '18:00', '20:00', 'Harlington', '2030-01-01', '2030-12-31')`;
  await sql`insert into event (id, title, event_type, start, "end", venue, series_id)
    values (${event}, ${`Kit list training ${run}`}, 'training', now() + interval '5 days', now() + interval '5 days 2 hours', 'Harlington', ${series})`;
  await sql`insert into checklist (id, scope, scope_id) values (${seriesList}, 'series', ${series})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${seriesList}, ${bibs})`;
  await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${seriesList}, ${cones})`;
  await sql`insert into "user" (id, name, email, access_state) values (${tom}, ${tomName}, ${`tom-${run}@example.com`}, 'approved')`;
  const bibsDuty = crypto.randomUUID();
  await sql`insert into duty (id, event_id, equipment_unit_id, direction) values (${bibsDuty}, ${event}, ${bibs}, 'to')`;
  await sql`insert into duty_user (id, duty_id, user_id) values (${crypto.randomUUID()}, ${bibsDuty}, ${tom})`;

  await signIn(page);
  await page.goto(`/events/${event}`);
  const kit = page.getByRole("region", { name: "Who's bringing what" });
  const sheet = page.getByRole("dialog");
  await expect(kit.getByText(bibsName)).toBeVisible();
  await expect(kit.getByText(`${conesName} ×4`)).toBeVisible();

  // Adding to the inherited list keeps what was already on it.
  await kit.getByRole("button", { name: "Add equipment" }).click();
  await sheet.getByRole("button", { name: `Add ${flagsName}` }).click();
  await expect(page.getByText(`Added ${flagsName}`)).toBeVisible();
  // A counted unit can be added with fewer than all of them.
  await sheet.getByLabel(`How many ${tapeName}`).selectOption("1");
  await sheet.getByRole("button", { name: `Add ${tapeName}` }).click();
  await expect(page.getByText(`Added ${tapeName}`)).toBeVisible();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(kit.getByText(`${tapeName} ×1`)).toBeVisible();
  await expect(kit.getByText(flagsName)).toBeVisible();
  await expect(kit.getByText(bibsName)).toBeVisible();
  await expect(kit.getByText(`${conesName} ×4`)).toBeVisible();
  await expect(kit.getByRole("button", { name: `Bring ${bibsName}: ${tomName}` })).toBeVisible();

  await kit.getByRole("button", { name: "Edit", exact: true }).click();

  // Lower a quantity.
  await kit.getByRole("button", { name: `Edit ${conesName}` }).click();
  await kit.getByLabel(`How many ${conesName}?`).selectOption("2");
  await expect(kit.getByText(`${conesName} ×2`)).toBeVisible();

  // Nobody is on the flags, so they come off straight away.
  await kit.getByRole("button", { name: `Remove ${flagsName}` }).click();
  await expect(kit.getByText(flagsName)).toBeHidden();

  // Tom is on the bibs, so it asks first; keeping them changes nothing.
  await kit.getByRole("button", { name: `Remove ${bibsName}` }).click();
  await expect(sheet).toContainText(tomName);
  await sheet.getByRole("button", { name: "Keep it" }).click();
  await expect(kit.getByText(bibsName)).toBeVisible();
  await kit.getByRole("button", { name: `Remove ${bibsName}` }).click();
  await sheet.getByRole("button", { name: "Take it off" }).click();
  await expect(kit.getByText(bibsName)).toBeHidden();
  expect(await sql`select 1 from duty where event_id = ${event} and equipment_unit_id = ${bibs}`).toHaveLength(0);

  await kit.getByRole("button", { name: "Done", exact: true }).click();
  await expect(kit.getByRole("button", { name: `Remove ${conesName}` })).toBeHidden();

  await sql`delete from duty_user where duty_id in (select id from duty where event_id = ${event})`;
  await sql`delete from duty where event_id = ${event}`;
  await sql`delete from checklist_item where checklist_id in (select id from checklist where scope_id in (${event}, ${series}))`;
  await sql`delete from checklist where scope_id in (${event}, ${series})`;
  await sql`delete from event where id = ${event}`;
  await sql`delete from series where id = ${series}`;
  await sql`delete from equipment_unit where id in (${bibs}, ${cones}, ${flags}, ${tape})`;
  await sql`delete from store where id in (${shed}, 'Harlington')`;
  await sql`delete from "user" where id = ${tom}`;
  await sql.end();
});
