import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";

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
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();
}

test("Committee add Kit Units and Events from the Kit and Events pages, with a confirmation toast", async ({
  page,
  baseURL,
}) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const storeName = `Locker ${run}`;
  const venueName = `Pitch ${run}`;
  await sql`insert into store (id, name, address) values (${crypto.randomUUID()}, ${storeName}, 'x')`;
  await signIn(page, baseURL);

  const kitName = `Cones ${run}`;
  await page.goto("/kit");
  await page.getByRole("button", { name: "Add kit" }).click();
  const kitSheet = page.getByRole("dialog");
  await kitSheet.getByLabel("Name").fill(kitName);
  await kitSheet.getByLabel("Home").selectOption({ label: storeName });
  await kitSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Kit added")).toBeVisible();
  await expect(page).toHaveURL(/\/kit$/);
  await page.getByRole("button", { name: `I've got ${kitName}` }).click();
  await expect(page.getByRole("region", { name: "With you" }).getByRole("link", { name: kitName })).toBeVisible();

  const title = `Training ${run}`;
  // A near-future day, so it lands in the Agenda tab's soonest-15 list, distinct from other tests' events.
  const day = new Date(Date.now() + (1 + Math.floor(Math.random() * 3)) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.goto("/events");
  await page.getByRole("button", { name: "Add event" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Date").fill(day);
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByLabel("Start time").fill("18:00");
  await sheet.getByLabel("End time").fill("20:00");
  await sheet.getByLabel("Venue").fill(venueName);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Event created")).toBeVisible();
  await page.getByRole("tab", { name: "Agenda" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Events" }).first().click();
  await expect(page).toHaveURL(/\/events$/);
  await sql.end();
});
