import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

async function seedMatch() {
  const sql = postgres(TEST_DATABASE_URL);
  const tag = crypto.randomUUID().slice(0, 8);
  const eventId = crypto.randomUUID();
  const lock = `Lee ${tag}`;
  const hooker = `Hal ${tag}`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventId}, ${`Match ${tag}`}, 'match', now() + interval '5 days', now() + interval '5 days 2 hours', 'Harlington')`;
  await sql`insert into match_details (event_id, opponent, home_away, competition, meet_time)
    values (${eventId}, 'Barts', 'home', 'bucs', now() + interval '5 days')`;
  await sql`insert into "user" (id, name, email, email_verified, access_state, preferred_position)
    values (${crypto.randomUUID()}, ${lock}, ${`${tag}-lock@x.org`}, true, 'approved', 'Lock'),
           (${crypto.randomUUID()}, ${hooker}, ${`${tag}-hooker@x.org`}, true, 'approved', 'Hooker')`;
  await sql.end();
  return { eventId, lock, hooker };
}

test("Committee pick a team on the board: the best fits come first, and a Guest can fill a Shirt", async ({ page }) => {
  const { eventId, lock, hooker } = await seedMatch();
  await signIn(page);

  await page.goto(`/events/${eventId}`);
  await page.getByRole("link", { name: "Pick the team" }).click();
  await expect(page.getByRole("heading", { name: "Pick the team" })).toBeVisible();

  await page.getByRole("button", { name: /^Shirt 4, Lock, empty/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Preferred position")).toBeVisible();
  await sheet.getByRole("button", { name: new RegExp(lock) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Shirt 4, Lock, ${lock}`) })).toBeVisible();

  // Someone playing out of position is flagged, but allowed.
  await page.getByRole("button", { name: /^Shirt 10, Fly-half, empty/ }).click();
  await sheet.getByRole("button", { name: new RegExp(hooker) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Shirt 10, Fly-half, ${hooker}`) })).toContainText("Out of position");

  // Picking them again for another Shirt moves them.
  await page.getByRole("button", { name: /^Shirt 2, Hooker, empty/ }).click();
  await sheet.getByRole("button", { name: new RegExp(hooker) }).click();
  await expect(page.getByText("Moved from")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Shirt 10, Fly-half, empty/ })).toBeVisible();

  await page.getByRole("button", { name: /^Shirt 20, empty/ }).click();
  await sheet.getByLabel("Guest's name").fill("Dev Ringer");
  await sheet.getByRole("button", { name: "Add guest" }).click();
  await expect(page.getByRole("button", { name: /^Shirt 20, Dev Ringer/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(`^Shirt 4, Lock, ${lock}`) })).toBeVisible();
});
