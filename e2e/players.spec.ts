import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Committee sees Players and Admin in the bottom tabs, alongside Events", async ({ page }) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Events" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Players" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();

  // Home's "What's coming up" title links across to Events too.
  await expect(page.getByRole("link", { name: "What's coming up" })).toHaveAttribute("href", "/events");
});

test("Committee sets a Player's Positions and switches Playing off, and they move to Not playing", async ({ page }) => {
  // Its own Player, so switching Playing off can't upset specs that need the Admin playing.
  const sql = postgres(TEST_DATABASE_URL);
  const name = `Pat ${crypto.randomUUID().slice(0, 8)}`;
  await sql`insert into "user" (id, name, email, email_verified, access_state, preferred_position)
    values (${crypto.randomUUID()}, ${name}, ${`${name.replace(" ", ".")}@x.org`}, true, 'approved', 'Hooker')`;
  await sql.end();

  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/players$/);
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Positions save as soon as they change, and the Preferred one can't also be an Other Position.
  await expect(page.getByRole("button", { name: "Save positions" })).toHaveCount(0);
  await page.getByLabel("Preferred Position").selectOption("Lock");
  await expect(page.getByText("Positions saved")).toBeVisible();
  await page.getByRole("button", { name: /Other Positions/ }).click();
  await expect(page.getByLabel("Lock")).toBeDisabled();
  await page.getByLabel("Number 8").check();
  await expect(page.getByText("Positions saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Preferred Position")).toHaveValue("Lock");
  await page.getByRole("button", { name: /Other Positions/ }).click();
  await expect(page.getByLabel("Number 8")).toBeChecked();

  await page.getByRole("button", { name: "Switch Playing off" }).click();
  await expect(page.getByText("Not playing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch Playing on" })).toBeVisible();

  await nav.getByRole("link", { name: "Players" }).click();
  await page.getByText(/Not playing \(\d+\)/).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});
