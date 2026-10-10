import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { seedUser, signIn } from "./support/sign-in";
import { TEST_DATABASE_URL } from "./support/test-db";

test("A Player reports an injury, sees it on Home, and updates it from there", async ({ page }) => {
  const email = await seedUser();
  await signIn(page, { email, next: "/profile" });

  await page.getByRole("button", { name: "Report an injury" }).click();
  await page.getByRole("button", { name: "Knee" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Pick when you expect to be back, or say you're not sure yet.")).toBeVisible();
  await page.getByRole("button", { name: "Not sure yet" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Injury saved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "My injuries" })).toBeVisible();
  await expect(page.getByText("Out", { exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Knee" })).toBeVisible();
  await page.getByRole("button", { name: "Update" }).click();
  await page.getByRole("button", { name: /Training only/ }).click();
  await page.getByLabel("I'd like the physio's help at games").check();
  await page.getByLabel("What do you need?").fill("Strapping");
  await page.getByLabel("Progress note (shown in the history)").fill("Jogged 5k");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Update saved")).toBeVisible();
  await expect(page.getByText("Training only", { exact: true })).toBeVisible();

  await page.goto("/profile");
  await page.getByText("History").first().click();
  await expect(page.getByText(/Out → Training only/)).toBeVisible();
  await expect(page.getByText("“Jogged 5k”")).toBeVisible();
  await expect(page.getByText("Needs physio: Strapping")).toBeVisible();
});

test("Committee report an injury for a Player and find them with the Injured filter", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const name = `Ines ${crypto.randomUUID().slice(0, 8)}`;
  const id = crypto.randomUUID();
  await sql`insert into "user" (id, name, email, email_verified, access_state, preferred_position)
    values (${id}, ${name}, ${`${name.replace(" ", ".")}@x.org`}, true, 'approved', 'Hooker')`;
  await sql.end();

  await signIn(page, { next: `/players/${id}` });
  await page.getByRole("button", { name: "Report an injury" }).click();
  await page.getByRole("button", { name: "Ankle" }).click();
  await page.getByRole("button", { name: "Not sure yet" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Injury saved")).toBeVisible();

  await page.goto(`/players?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("link", { name: new RegExp(`${name}.*Out · ankle`) })).toBeVisible();
  await page.getByRole("link", { name: "Injured" }).click();
  await expect(page).toHaveURL(/injured=1/);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
});
