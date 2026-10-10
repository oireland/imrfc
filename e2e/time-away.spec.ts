import { expect, test } from "@playwright/test";
import { seedUser, signIn } from "./support/sign-in";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test("A Player adds time away on Profile, sees it on Home, and ends it with I'm back", async ({ page }) => {
  const email = await seedUser();
  await signIn(page, { email, next: "/profile" });

  await page.getByRole("button", { name: "Add time away" }).click();
  await page.getByLabel("From").fill(day(-1));
  await page.getByLabel("Until").fill(day(5));
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Say why you'll be away.")).toBeVisible();
  await page.getByLabel("Why?").fill("Exams");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Away now")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "You're away" })).toBeVisible();
  await expect(page.getByText(/Exams/)).toBeVisible();

  await page.getByRole("button", { name: "I'm back" }).click();
  await expect(page.getByRole("heading", { name: "You're away" })).toHaveCount(0);

  await page.goto("/profile");
  await expect(page.getByText(/Away .*Exams/)).toBeVisible();
  await expect(page.getByText("Away now")).toHaveCount(0);
});
