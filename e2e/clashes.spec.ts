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

test("Unfilled Duties get a heads-up, not a Clash, on the Event and the Kit Unit", async ({ page, baseURL }) => {
  const sql = postgres(process.env.DATABASE_URL ?? "postgres://imrfc:imrfc@localhost:5432/imrfc");
  const run = crypto.randomUUID().slice(0, 8);
  const [store, venue, kit, event, list] = Array.from({ length: 5 }, () => crypto.randomUUID());
  const kitName = `Cones ${run}`;
  await sql`insert into location (id, name, address, is_store) values (${store}, ${`Shed ${run}`}, 'x', true)`;
  await sql`insert into location (id, name, address, is_venue) values (${venue}, ${`Pitch ${run}`}, 'x', true)`;
  await sql`insert into kit_unit (id, name, home_id, store_id) values (${kit}, ${kitName}, ${store}, ${store})`;
  await sql`insert into event (id, title, event_type, start, "end", venue_id)
    values (${event}, ${`Clash training ${run}`}, 'training', now() + interval '1 hour', now() + interval '3 hours', ${venue})`;
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
  const headsUp = `Nobody is taking ${kitName} to or back from Clash training ${run}, and it starts within 48 hours.`;
  // On the Event, the heads-up sits with the kit it is about.
  const duties = page.getByRole("region", { name: "Who's bringing what" });
  await expect(duties.getByText(headsUp)).toBeVisible();
  await expect(duties.getByRole("button", { name: `Bring ${kitName}: nobody yet` })).toContainText("Needs someone");
  await expect(page.getByText("Clashes")).toHaveCount(0);
  // Duty Summary previews the WhatsApp message with the unassigned Kit Unit flagged.
  await expect(page.getByText(`${kitName}: ❗unassigned`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy WhatsApp message" })).toBeVisible();

  await page.goto(`/kit/${kit}`);
  await expect(page.getByRole("region", { name: "Heads up" }).getByText(headsUp)).toBeVisible();
  await sql.end();
});
