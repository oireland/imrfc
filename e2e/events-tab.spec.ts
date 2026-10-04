import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { seedUser, signIn } from "./support/sign-in";

/** A Training and a Match a few hours out, so they sit at the top of the Agenda. */
async function seedEvents(run: string) {
  const sql = postgres(TEST_DATABASE_URL);
  const training = `Fitness ${run}`;
  const match = `Friendly ${run}`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${crypto.randomUUID()}, ${training}, 'training', now() + interval '3 hours', now() + interval '5 hours', 'Harlington')`;
  const matchId = crypto.randomUUID();
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${matchId}, ${match}, 'match', now() + interval '4 hours', now() + interval '6 hours', 'Harlington')`;
  await sql`insert into team (id, name) values ('1st XV', '1st XV') on conflict do nothing`;
  await sql`insert into match_details (event_id, team_id, opponent, home_away, competition, meet_time)
    values (${matchId}, '1st XV', 'Barts', 'home', 'friendly', now() + interval '3 hours')`;
  await sql.end();
  return { training, match };
}

test("Events has its own tab, a bookmarkable Agenda, a type filter, and replies from the Agenda", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const { training, match } = await seedEvents(run);
  await signIn(page);

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(/\/events$/);

  // The view lives in the URL, so a reload (or bookmark) keeps it.
  await page.getByRole("tab", { name: "agenda" }).click();
  await expect(page).toHaveURL(/\/events\?view=agenda$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: "agenda" })).toHaveAttribute("aria-selected", "true");

  // Filter to Matches: also in the URL.
  const row = (title: string) => page.getByRole("listitem").filter({ hasText: title });
  await expect(row(training)).toBeVisible();
  await page.getByRole("radio", { name: "Matches" }).click();
  await expect(page).toHaveURL(/\/events\?view=agenda&type=match$/);
  await expect(row(match)).toBeVisible();
  await expect(row(training)).toBeHidden();

  // Reply straight from the Agenda, then see the reply there.
  await page.goto("/events?view=agenda&type=training");
  await expect(row(match)).toBeHidden();
  await row(training).getByRole("button", { name: "I'm in" }).click();
  await expect(page.getByText("You're in", { exact: true }).first()).toBeVisible();
  await expect(row(training).getByRole("button", { name: /You're in/ })).toBeVisible();

  await page.goto("/events?view=agenda&type=match");
  await row(match).getByRole("button", { name: "I'm out" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Why not?").fill("Exams");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(row(match).getByRole("button", { name: /You're out/ })).toBeVisible();
});

test("replies to Training and Matches from the Calendar's selected day", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const { training, match } = await seedEvents(run);
  // A Member, who has no Add button.
  await signIn(page, { email: await seedUser(), next: "/events?view=calendar" });

  const day = page.getByRole("button", { name: new RegExp(training) });
  await day.click();
  const row = (title: string) => page.getByRole("listitem").filter({ hasText: title });

  await row(training).getByRole("button", { name: "I'm in" }).click();
  await expect(row(training).getByRole("button", { name: /You're in/ })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(match) }).click();
  await row(match).getByRole("button", { name: "I'm out" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Why not?").fill("Exams");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(row(match).getByRole("button", { name: /You're out/ })).toBeVisible();
});
