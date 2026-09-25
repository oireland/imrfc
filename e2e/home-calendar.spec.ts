import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

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

test("Committee add an Event by tapping a day on the Home calendar", async ({ page, baseURL }) => {
  const sql = postgres(process.env.DATABASE_URL ?? "postgres://imrfc:imrfc@localhost:5432/imrfc");
  const run = crypto.randomUUID().slice(0, 8);
  const venueName = `Pitch ${run}`;
  await signIn(page, baseURL);

  const calendar = page.getByRole("region", { name: "What's coming up" });
  // Tap the 28th (every month has one): an empty day opens the sheet at once; a busy day
  // is selected first and opens on a second tap.
  const day = calendar.getByRole("button", { name: /\b28 / }).last();
  await day.click();
  const opened = await page.getByRole("dialog").waitFor({ timeout: 1000 }).then(() => true, () => false);
  if (!opened) await day.click();

  const sheet = page.getByRole("dialog", { name: /28/ });
  const title = `Fitness ${run}`;
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByRole("button", { name: "Social" }).click();
  await sheet.getByLabel("Venue").fill(venueName);
  await sheet.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Event created")).toBeVisible();
  await expect(calendar.getByRole("button", { name: new RegExp(title) })).toBeVisible();
  await expect(calendar.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await sql.end();
});

test("the crest switches between System, Light and Dark, and remembers the choice", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  const html = page.locator("html");

  await page.getByRole("button", { name: "Colour theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "Colour theme" }).click();
  await page.getByRole("menuitemradio", { name: "System" }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  await page.reload();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
});
