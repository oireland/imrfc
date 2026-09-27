import { expect, test } from "@playwright/test";

test("a signed-out visitor is sent to sign in from Series admin", async ({ page }) => {
  await page.goto("/admin/series");

  await expect(page).toHaveURL(/\/sign-in(\?next=.*)?$/);
});

test("a signed-out visitor is sent to sign in from Checklists admin", async ({ page }) => {
  await page.goto("/admin/checklists");

  await expect(page).toHaveURL(/\/sign-in(\?next=.*)?$/);
});

test("a signed-out visitor is sent to sign in from an Event's Duties", async ({ page }) => {
  await page.goto("/events/some-event");

  await expect(page).toHaveURL(/\/sign-in(\?next=.*)?$/);
});
