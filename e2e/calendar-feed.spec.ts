import { expect, test } from "@playwright/test";

const MAILPIT = "http://localhost:8025";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "irelandoliver4@gmail.com";

async function magicLink(email: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)).json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json();
      const match = String(msg.Text).match(/https?:\/\/\S+/);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No magic link email arrived in Mailpit");
}

test("Profile shows a Calendar Feed URL that works without signing in until it is reset", async ({ page, baseURL, playwright }) => {
  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();

  await page.goto("/profile");
  const feedUrl = (await page.locator("code").innerText()).trim();
  const anonymous = await playwright.request.newContext();
  const first = await anonymous.get(feedUrl);
  expect(first.status()).toBe(200);
  expect(first.headers()["content-type"]).toContain("text/calendar");
  expect(await first.text()).toContain("BEGIN:VCALENDAR");

  await page.getByRole("button", { name: "Reset feed URL" }).click();
  await expect(page.locator("code")).not.toHaveText(feedUrl);
  expect((await anonymous.get(feedUrl)).status()).toBe(404);
});
