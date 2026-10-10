import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Event detail splits Availability and Kit into tabs, and a Social has no Availability", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [shed, bibs, training, social] = Array.from({ length: 4 }, () => crypto.randomUUID());
  await sql`insert into store (id, name, address) values (${shed}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into equipment_unit (id, name, home_id) values (${bibs}, ${`Bibs ${run}`}, ${shed})`;
  for (const [id, type] of [[training, "training"], [social, "social"]]) {
    await sql`insert into event (id, title, event_type, start, "end", venue)
      values (${id}, ${`${type} ${run}`}, ${type}, now() + interval '5 days', now() + interval '5 days 2 hours', 'Harlington')`;
    const list = crypto.randomUUID();
    await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${id})`;
    await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${list}, ${bibs})`;
  }

  await signIn(page);
  await page.goto(`/events/${training}`);
  const tabs = page.getByRole("tablist", { name: "Event sections" });
  await expect(tabs.getByRole("tab", { name: "Availability" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Who's bringing what" })).toBeHidden();
  await expect(tabs.getByRole("tab", { name: "Team sheet" })).toHaveCount(0);

  await tabs.getByRole("tab", { name: /^Kit/ }).click();
  await expect(page.getByRole("region", { name: "Who's bringing what" })).toBeVisible();
  await expect(page).toHaveURL(/tab=kit/);

  // A Social takes no replies, so it opens on Kit.
  await page.goto(`/events/${social}`);
  await expect(tabs.getByRole("tab", { name: "Availability" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Who's bringing what" })).toBeVisible();
  await sql.end();
});
