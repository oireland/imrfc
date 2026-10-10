import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { magicLink } from "./support/sign-in";

test("A new User is asked for their name, position and number, can put it off, and it comes back in a new tab", async ({
  page,
  context,
  baseURL,
}) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const email = `new-player-${run}@example.com`;

  const asked = Date.now() - 1000;
  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(email, asked));
  const linkOnThisServer = new URL(link.pathname + link.search, baseURL).toString();
  // A mail scanner (Outlook Safe Links) fetches the link before the person does; that must not spend it.
  expect((await fetch(linkOnThisServer)).status).toBe(200);
  await page.goto(linkOnThisServer);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/waiting-for-approval$/);

  await sql`update "user" set access_state = 'approved' where email = ${email}`;
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Welcome to the club" });
  await expect(dialog).toBeVisible();

  // Put it off for now: the app stays usable and the modal doesn't come back this tab.
  await dialog.getByRole("button", { name: "Not now" }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(dialog).not.toBeVisible();

  // A new tab is a new session as far as onboarding is concerned, so it asks again.
  const secondPage = await context.newPage();
  await secondPage.goto("/");
  const secondDialog = secondPage.getByRole("dialog", { name: "Welcome to the club" });
  await expect(secondDialog).toBeVisible();

  const firstName = `Jess${run}`;
  await secondDialog.getByLabel("Your name").fill(`${firstName} Carter`);
  await secondDialog.getByLabel("Your position").selectOption("Scrum-half");
  await secondDialog.getByLabel("Your mobile number").fill("07912 345678");
  await secondDialog.getByRole("button", { name: "Save" }).click();
  await expect(secondDialog).not.toBeVisible();
  await expect(secondPage.getByRole("heading", { name: new RegExp(firstName) })).toBeVisible();

  // Onboarded: it never comes back, even in a fresh tab.
  const thirdPage = await context.newPage();
  await thirdPage.goto("/");
  await expect(thirdPage.getByRole("dialog", { name: "Welcome to the club" })).not.toBeVisible();

  await sql.end();
});
