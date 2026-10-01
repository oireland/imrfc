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

test("Committee fill in the Team Sheet, give roles, and download the PDF", async ({ page }) => {
  const { eventId, lock } = await seedMatch();
  await signIn(page);

  await page.goto(`/events/${eventId}/selection`);
  await page.getByRole("button", { name: /^Shirt 4, Lock, empty/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(lock) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Shirt 4, Lock, ${lock}`) })).toBeVisible();

  await page.getByRole("link", { name: "Team sheet" }).click();
  await expect(page.getByRole("heading", { name: "Team sheet" })).toBeVisible();
  const preview = page.getByRole("article", { name: "Team sheet preview" });
  await expect(preview).toContainText("Harlington");
  await expect(preview).toContainText(lock);

  await page.getByLabel("Schedule").fill("Changing rooms 1.15pm");
  await expect(preview).toContainText("Changing rooms 1.15pm");

  await page.getByRole("button", { name: `captain for ${lock}`, exact: true }).click();
  await expect(preview.getByRole("cell", { name: "C", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Team sheet saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Schedule")).toHaveValue("Changing rooms 1.15pm");

  const pdf = await page.request.get(`/events/${eventId}/team-sheet/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("Committee name the team: it's on Event detail and Home for the Player, with a PDF", async ({ page }) => {
  const { eventId } = await seedMatch();
  await signIn(page);

  await page.goto(`/events/${eventId}/selection`);
  await page.getByRole("button", { name: /^Shirt 10, Fly-half, empty/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /E2E Admin/ }).click();
  await expect(page.getByRole("button", { name: /^Shirt 10, Fly-half, E2E Admin/ })).toBeVisible();

  await page.getByRole("button", { name: "Name the team", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/things missing\?/)).toBeVisible();
  await sheet.getByRole("button", { name: "Name the team", exact: true }).click();
  await expect(page.getByText(/^Named .* by E2E Admin/)).toBeVisible();

  // A later edit is held until Committee send it.
  await page.getByRole("button", { name: /^Shirt 11, Wing, empty/ }).click();
  await page.getByRole("dialog").getByLabel("Guest's name").fill("Dev Ringer");
  await page.getByRole("dialog").getByRole("button", { name: "Add guest" }).click();
  await expect(page.getByText("1 change not sent yet")).toBeVisible();
  await page.getByRole("button", { name: "Send changes" }).click();
  await expect(page.getByText("1 change not sent yet")).toBeHidden();

  await page.goto(`/events/${eventId}`);
  const team = page.getByRole("region", { name: "The team" });
  await expect(team).toContainText("You're at 10.");
  await expect(team).toContainText("Dev Ringer");

  const pdf = await page.request.get(`/events/${eventId}/team/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "You're playing" })).toBeVisible();
});
