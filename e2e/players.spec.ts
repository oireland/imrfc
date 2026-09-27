import { expect, test, type Page } from "@playwright/test";

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

test("Bottom tabs drop Events, and Committee sees Players alongside Admin", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Events" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Players" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();

  // Home's "What's coming up" links across to Events instead.
  await expect(page.getByRole("link", { name: /See all/ })).toHaveAttribute("href", "/events");
});

test("Committee sets a Player's Positions and switches Playing off, and they move to Not playing", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  const nav = page.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "Players" }).click();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.getByRole("link", { name: /E2E Admin/ })).toBeVisible();

  await page.getByRole("link", { name: /E2E Admin/ }).click();
  await expect(page.getByRole("heading", { name: "E2E Admin" })).toBeVisible();

  await page.getByLabel("Preferred Position").selectOption("Lock");
  await page.getByLabel("Number 8").check();
  await page.getByRole("button", { name: "Save positions" }).click();
  await expect(page.getByLabel("Preferred Position")).toHaveValue("Lock");
  await expect(page.getByLabel("Number 8")).toBeChecked();

  await page.getByRole("button", { name: "Switch Playing off" }).click();
  await expect(page.getByText("Not playing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch Playing on" })).toBeVisible();

  await nav.getByRole("link", { name: "Players" }).click();
  await expect(page.getByText("Not playing (1)")).toBeVisible();
  await page.getByText("Not playing (1)").click();
  await expect(page.getByRole("link", { name: /E2E Admin/ })).toBeVisible();

  // Restore Playing for other specs that rely on this seeded Admin.
  await page.getByRole("link", { name: /E2E Admin/ }).click();
  await page.getByRole("button", { name: "Switch Playing on" }).click();
});
