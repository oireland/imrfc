import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";

const MAILPIT = "http://localhost:8025";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "irelandoliver4@gmail.com";

async function magicLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const match = String(msg.Text).match(/https?:\/\/\S+/);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No magic link email arrived in Mailpit");
}

test("Clashes fire by total count, not just by overlap, once a Kit Unit is counted", async ({ page, baseURL }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const [store, kit, eventA, eventB, listA, listB] = Array.from({ length: 6 }, () => crypto.randomUUID());
  const kitName = `Tackle shields ${run}`;
  const titleA = `1st XV v Kings ${run}`;
  const titleB = `2nd XV v UCL ${run}`;
  await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
  await sql`insert into kit_unit (id, name, home_id, quantity) values (${kit}, ${kitName}, ${store}, 8)`;
  await sql`insert into kit_portion (id, kit_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${kit}, 8, 'store', ${store})`;
  // Two overlapping Matches, each asking for 4 of the 8 shields.
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventA}, ${titleA}, 'training', now() + interval '1 hour', now() + interval '3 hours', 'Harlington')`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventB}, ${titleB}, 'training', now() + interval '2 hours', now() + interval '4 hours', 'Harlington')`;
  await sql`insert into checklist (id, scope, scope_id) values (${listA}, 'event', ${eventA})`;
  await sql`insert into checklist_item (id, checklist_id, kit_unit_id, count) values (${crypto.randomUUID()}, ${listA}, ${kit}, 4)`;
  await sql`insert into checklist (id, scope, scope_id) values (${listB}, 'event', ${eventB})`;
  await sql`insert into checklist_item (id, checklist_id, kit_unit_id, count) values (${crypto.randomUUID()}, ${listB}, ${kit}, 4)`;

  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();

  // 4 and 4 of 8 is fine: no Clash on either overlapping Event.
  await page.goto(`/events/${eventA}`);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.goto(`/events/${eventB}`);
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Raise one Event's count to 6: between them they now need more than the Quantity.
  await page.getByRole("combobox", { name: "How many" }).selectOption("6");

  await page.goto(`/events/${eventA}`);
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    `${titleA} and ${titleB} need 10 ${kitName} between them, but the club only has 8.`,
  );

  await sql`delete from duty where event_id in (${eventA}, ${eventB})`;
  await sql`delete from checklist_item where checklist_id in (${listA}, ${listB})`;
  await sql`delete from checklist where id in (${listA}, ${listB})`;
  await sql`delete from event where id in (${eventA}, ${eventB})`;
  await sql`delete from movement_log_entry where kit_unit_id = ${kit}`;
  await sql`delete from kit_portion where kit_unit_id = ${kit}`;
  await sql`delete from kit_unit where id = ${kit}`;
  await sql`delete from store where id = ${store}`;
  await sql.end();
});
