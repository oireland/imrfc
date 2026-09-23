import { expect, test } from "@playwright/test";

test("home page shows the club crest and app name", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("img", { name: "IMRFC crest" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "IMRFC Club Hub" }),
  ).toBeVisible();
});
