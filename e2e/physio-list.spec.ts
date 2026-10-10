import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Committee copy the physio list for a Match's team, and for the whole club from Players", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sql = postgres(TEST_DATABASE_URL);
  const tag = crypto.randomUUID().slice(0, 8);
  const eventId = crypto.randomUUID();
  const picked = { id: crypto.randomUUID(), name: `Pia ${tag}` };
  const benched = { id: crypto.randomUUID(), name: `Ben ${tag}` };
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventId}, ${`Match ${tag}`}, 'match', now() + interval '5 days', now() + interval '5 days 2 hours', 'Harlington')`;
  await sql`insert into team (id, name) values ('1st XV', '1st XV') on conflict do nothing`;
  await sql`insert into match_details (event_id, team_id, opponent, home_away, competition, meet_time)
    values (${eventId}, '1st XV', 'Barts', 'home', 'bucs', now() + interval '5 days')`;
  for (const p of [picked, benched]) {
    await sql`insert into "user" (id, name, email, email_verified, access_state, preferred_position)
      values (${p.id}, ${p.name}, ${`${p.id}@x.org`}, true, 'approved', 'Lock')`;
    await sql`insert into injury (id, user_id, area, happened_on, status, needs_physio, physio_note, reported_by_id)
      values (${crypto.randomUUID()}, ${p.id}, 'Ankle', current_date, 'training_only', true, 'Strapping', ${p.id})`;
  }
  await sql`insert into selection_shirt (event_id, shirt, user_id, updated_by_id) values (${eventId}, 4, ${picked.id}, ${picked.id})`;
  await sql.end();

  await signIn(page, { next: `/events/${eventId}` });
  const summary = page.getByText("Physio list").locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(summary).toContainText(`${picked.name} — ankle: Strapping`);
  await expect(summary).not.toContainText(benched.name);
  await summary.getByRole("button", { name: "Copy physio list" }).click();
  await expect(page.getByText("Copied. Paste it to the physio.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(picked.name);

  await page.goto("/players");
  const club = page.getByText("Physio list").locator("xpath=ancestor::*[@data-slot='card'][1]");
  await expect(club).toContainText(picked.name);
  await expect(club).toContainText(benched.name);
});
