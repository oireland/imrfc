import { expect, test } from "@playwright/test";

test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
});
