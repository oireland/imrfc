import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { seedUser, signIn } from "./support/sign-in";

test("Committee add an Event by tapping a day on the Home calendar", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const venueName = `Pitch ${run}`;
  await signIn(page);

  const calendar = page.getByRole("region", { name: "What's coming up" });
  // Tap the 28th (every month has one): an empty day opens the sheet at once; a busy day
  // is selected first and opens on a second tap.
  const day = calendar.getByRole("button", { name: /\b28 / }).last();
  await day.click();
  const opened = await page.getByRole("dialog").waitFor({ timeout: 1000 }).then(() => true, () => false);
  if (!opened) await day.click();

  const sheet = page.getByRole("dialog", { name: /28/ });
  const title = `Fitness ${run}`;
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByRole("button", { name: "Social" }).click();
  await sheet.getByLabel("Venue").fill(venueName);
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Event created")).toBeVisible();
  await expect(calendar.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await expect(calendar.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await sql.end();
});

test("the crest switches between System, Light and Dark, and remembers the choice", async ({ page }) => {
  // Its own User: the theme is saved per User, and other specs expect the Admin on System.
  await signIn(page, { email: await seedUser() });
  const html = page.locator("html");
  // The page switches at once and saves in the background; reload only once it's saved.
  const saved = () => page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);

  await page.getByRole("button", { name: "Colour theme" }).click();
  let save = saved();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await save;

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Colour theme" }).click();
  save = saved();
  await page.getByRole("menuitemradio", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  await save;
  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
});

test("Home filters What's coming up by Event Type, like Events", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const training = `Fitness ${run}`;
  const match = `Friendly ${run}`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${crypto.randomUUID()}, ${training}, 'training', now() + interval '3 hours', now() + interval '5 hours', 'Harlington')`;
  const matchId = crypto.randomUUID();
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${matchId}, ${match}, 'match', now() + interval '4 hours', now() + interval '6 hours', 'Harlington')`;
  await sql`insert into match_details (event_id, opponent, home_away, competition, meet_time)
    values (${matchId}, 'Barts', 'home', 'friendly', now() + interval '3 hours')`;
  await sql.end();
  await signIn(page, { email: await seedUser(), next: "/?view=agenda" });

  const comingUp = page.getByRole("region", { name: "What's coming up" });
  const row = (title: string) => comingUp.getByRole("listitem").filter({ hasText: title });
  await expect(row(training)).toBeVisible();
  await comingUp.getByRole("radio", { name: "Matches" }).click();
  await expect(page).toHaveURL(/\/\?view=agenda&type=match$/);
  await expect(row(match)).toBeVisible();
  await expect(row(training)).toBeHidden();
});
