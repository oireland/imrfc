import { expect, test, type Page } from "@playwright/test";

test("a signed-out visitor is sent to sign in from Events", async ({ page }) => {
  await page.goto("/events");

  await expect(page).toHaveURL(/\/sign-in(\?next=.*)?$/);
});

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

async function signIn(page: Page, baseURL: string | undefined) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

test("Committee edit a standalone Event's details from its pencil icon", async ({ page, baseURL }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const in60Days = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  await signIn(page, baseURL);

  // Create a one-off Social to edit.
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const addSheet = page.getByRole("dialog");
  const title = `Quiz Night ${run}`;
  await addSheet.getByLabel("Title").fill(title);
  await addSheet.getByRole("button", { name: "Social" }).click();
  await addSheet.getByLabel("Venue").fill("The Union");
  await addSheet.getByLabel("Date").fill(in60Days);
  await addSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Event created")).toBeVisible();

  await page.getByRole("tab", { name: "agenda" }).click();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  const newTitle = `Christmas Quiz ${run}`;
  await page.getByRole("button", { name: "Edit event" }).click();
  const editSheet = page.getByRole("dialog");
  await editSheet.getByLabel("Title").fill(newTitle);
  await editSheet.getByLabel("Venue").fill("Harlington");
  await editSheet.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Event updated")).toBeVisible();
  await expect(page.getByText(newTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Harlington" })).toBeVisible();
});
