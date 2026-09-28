import { expect, test } from "@playwright/test";
import { signIn } from "./support/sign-in";

test("Profile shows a Calendar Feed URL that works without signing in until it is reset", async ({ page, playwright }) => {
  await signIn(page);

  await page.goto("/profile");
  const feedUrl = (await page.locator("code").innerText()).trim();
  const anonymous = await playwright.request.newContext();
  const first = await anonymous.get(feedUrl);
  expect(first.status()).toBe(200);
  expect(first.headers()["content-type"]).toContain("text/calendar");
  expect(await first.text()).toContain("BEGIN:VCALENDAR");

  await page.getByRole("button", { name: "Reset link" }).click();
  await page.getByRole("button", { name: "Yes, reset" }).click();
  await expect(page.locator("code")).not.toHaveText(feedUrl);
  expect((await anonymous.get(feedUrl)).status()).toBe(404);
});
