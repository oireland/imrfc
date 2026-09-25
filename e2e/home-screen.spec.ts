import { expect, test } from "@playwright/test";
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

test("Home shows my Duties, what's coming up and the Kit I hold", async ({ page, baseURL }) => {
  const sql = postgres(process.env.DATABASE_URL ?? "postgres://imrfc:imrfc@localhost:5432/imrfc");
  const run = crypto.randomUUID().slice(0, 8);
  const [store, venue, kit, event, list] = Array.from({ length: 5 }, () => crypto.randomUUID());
  const kitName = `Tackle shield ${run}`;
  const eventTitle = `Home training ${run}`;
  await sql`insert into location (id, name, address, is_store) values (${store}, ${`Shed ${run}`}, 'x', true)`;
  await sql`insert into location (id, name, address, is_venue) values (${venue}, ${`Pitch ${run}`}, 'x', true)`;
  await sql`insert into kit_unit (id, name, home_id, store_id) values (${kit}, ${kitName}, ${store}, ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue_id)
    values (${event}, ${eventTitle}, 'training', now() + interval '1 hour', now() + interval '3 hours', ${venue})`;
  await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${event})`;
  await sql`insert into checklist_item (id, checklist_id, kit_unit_id) values (${crypto.randomUUID()}, ${list}, ${kit})`;

  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();

  await page.goto(`/events/${event}`);
  await page.getByRole("button", { name: "Claim" }).first().click();
  await page.getByRole("button", { name: "Confirm" }).first().click();
  await expect(page.getByText("Confirmed", { exact: true })).toHaveCount(1);

  await page.goto("/");
  const duties = page.getByRole("region", { name: "Your duties" });
  const duty = duties.getByRole("link", { name: new RegExp(kitName) });
  await expect(duty).toContainText("Take away");
  const comingUp = page.getByRole("region", { name: "What's coming up" });
  await comingUp.getByRole("tab", { name: "agenda" }).click();
  await expect(comingUp.getByRole("link", { name: new RegExp(eventTitle) })).toBeVisible();
  // Home names the first two held Kit Units, then "& N more" links to the Kit page.
  const held = page.getByRole("link", { name: kitName, exact: true });
  if ((await held.count()) === 0) {
    await page.getByRole("link", { name: /\d+ more$/ }).click();
    await expect(page.getByRole("region", { name: "With you" }).getByRole("link", { name: kitName })).toBeVisible();
  } else {
    await expect(held).toBeVisible();
  }
  await sql.end();
});
