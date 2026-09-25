import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import postgres from "postgres";


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

test("Committee give a Duty to a teammate and choose where the kit goes back to, from the Duty sheet", async ({ page, baseURL }) => {
  const sql = postgres(process.env.DATABASE_URL ?? "postgres://imrfc:imrfc@localhost:5432/imrfc");
  const run = crypto.randomUUID().slice(0, 8);
  const [store, otherStore, venue, kit, event, list, teammate] = Array.from({ length: 7 }, () => crypto.randomUUID());
  const kitName = `Tackle shields ${run}`;
  const teammateName = `Tom ${run}`;
  await sql`insert into location (id, name, address, is_store) values (${store}, ${`Shed ${run}`}, 'x', true)`;
  await sql`insert into location (id, name, address, is_store) values (${otherStore}, ${`Locker ${run}`}, 'x', true)`;
  await sql`insert into location (id, name, address, is_venue) values (${venue}, ${`Pitch ${run}`}, 'x', true)`;
  await sql`insert into kit_unit (id, name, home_id, store_id) values (${kit}, ${kitName}, ${store}, ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue_id)
    values (${event}, ${`Sheet training ${run}`}, 'training', now() + interval '5 days', now() + interval '5 days 2 hours', ${venue})`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, kit_unit_id) values (${crypto.randomUUID()}, ${list}, ${kit})`;
  await sql`insert into "user" (id, name, email, access_state) values (${teammate}, ${teammateName}, ${`${run}@example.com`}, 'approved')`;

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();

  await page.goto(`/events/${event}`);
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  await expect(duties.getByRole("button", { name: `Bring ${kitName}: nobody yet` })).toContainText("Up for grabs");

  await duties.getByRole("button", { name: `Take back ${kitName}: nobody yet` }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Give it to someone" }).click();
  const results = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  const search = sheet.getByLabel("Search people");
  if (await search.count()) await search.fill(run);
  await sheet.getByRole("button", { name: teammateName }).click();
  await expect(sheet).toBeHidden();
  await expect(duties.getByRole("button", { name: `Take back ${kitName}: ${teammateName}` })).toBeVisible();

  await duties.getByRole("button", { name: `Take back ${kitName}: ${teammateName}` }).click();
  await sheet.getByRole("button", { name: /Goes back to/ }).click();
  await sheet.getByRole("button", { name: `Locker ${run}` }).click();
  await expect(sheet).toBeHidden();
  await duties.getByRole("button", { name: `Take back ${kitName}: ${teammateName}` }).click();
  await expect(sheet).toContainText(`Goes back to Locker ${run}`);

  // Test people would otherwise pile up in every person picker on the dev database.
  await sql`delete from duty where event_id = ${event}`;
  await sql`delete from checklist_item where checklist_id = ${list}`;
  await sql`delete from checklist where id = ${list}`;
  await sql`delete from event where id = ${event}`;
  await sql`delete from kit_unit where id = ${kit}`;
  await sql`delete from location where id in (${store}, ${otherStore}, ${venue})`;
  await sql`delete from "user" where id = ${teammate}`;
  await sql.end();
});
