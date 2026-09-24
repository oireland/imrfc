import { expect, test } from "@playwright/test";

test("a signed-out visitor is sent to sign in from Series admin", async ({ page }) => {
  await page.goto("/admin/series");

  await expect(page).toHaveURL(/\/sign-in$/);
});
