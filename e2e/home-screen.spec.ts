import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Home shows my Duties, what's coming up and the Kit I hold", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, kit, event, list] = Array.from({ length: 4 }, () => crypto.randomUUID());
  const kitName = `Tackle shield ${run}`;
  const eventTitle = `Home training ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into kit_unit (id, name, home_id) values (${kit}, ${kitName}, ${store})`;
  await sql`insert into kit_portion (id, kit_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${kit}, 1, 'store', ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${event}, ${eventTitle}, 'training', now() + interval '1 hour', now() + interval '3 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, kit_unit_id) values (${crypto.randomUUID()}, ${list}, ${kit})`;

  await signIn(page);

  await page.goto(`/events/${event}`);
  const eventDuties = page.getByRole("region", { name: "Who's bringing what" });
  await eventDuties.getByRole("button", { name: `Bring ${kitName}: nobody yet` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "I'll do it" }).click();
  await eventDuties.getByRole("button", { name: `Bring ${kitName}: you` }).click();
  await page.getByRole("dialog").getByRole("button", { name: /mark as done/ }).click();
  await expect(eventDuties.getByRole("button", { name: `Bring ${kitName}: you, done` })).toBeVisible();

  await page.goto("/");
  const duties = page.getByRole("region", { name: "Your duties" });
  const duty = duties.getByRole("link", { name: new RegExp(kitName) });
  await expect(duty).toContainText("Take back");
  const comingUp = page.getByRole("region", { name: "What's coming up" });
  await comingUp.getByRole("tab", { name: "agenda" }).click();
  await expect(comingUp.getByRole("link", { name: new RegExp(eventTitle) })).toBeVisible();
  // Home names the first two held Kit Units, then "& N more" links to the Kit page.
  await expect(page.getByText("You've got:")).toBeVisible();
  const held = page.getByRole("link", { name: kitName, exact: true });
  if ((await held.count()) === 0) {
    await page.getByRole("link", { name: /\d+ more$/ }).click();
    await expect(page.getByRole("region", { name: "With you" }).getByRole("link", { name: kitName })).toBeVisible();
  } else {
    await expect(held).toBeVisible();
  }
  await sql.end();
});
