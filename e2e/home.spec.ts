import { expect, test } from "@playwright/test";

test("a signed-out visitor sees the club crest, with no app name", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("img", { name: "Imperial Medicals RFC" })).toBeVisible();
  await expect(page.getByText("IMRFC Club Hub")).toHaveCount(0);
});
