import { expect, test } from "@playwright/test";

test("a signed-out visitor is sent to sign in from Events", async ({ page }) => {
  await page.goto("/events");

  await expect(page).toHaveURL(/\/sign-in$/);
});
