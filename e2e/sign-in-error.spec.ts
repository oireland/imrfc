import { expect, test } from "@playwright/test";

test("A dead sign-in link says why, instead of silently showing the sign-in page", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/?error=INVALID_TOKEN");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("alert")).toContainText("expired or already been used");
  await context.close();
});
