import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";

const MAILPIT = "http://localhost:8025";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "irelandoliver4@gmail.com";

async function magicLink(email: string, after: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`)).json();
    const latest = list.messages?.[0];
    if (latest && Date.parse(latest.Created) >= after) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json();
      const match = String(msg.Text).match(/https?:\/\/\S+/);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No magic link email arrived in Mailpit");
}

async function signIn(page: Page, baseURL: string | undefined) {
  const asked = Date.now() - 1000;
  await page.goto("/sign-in");
  await page.getByPlaceholder("you@example.com").fill(ADMIN_EMAIL);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(ADMIN_EMAIL, asked));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
  await expect(page.getByRole("link", { name: "Kit", exact: true })).toBeVisible();
}

/** An announced Training two days out that nobody has replied to. */
async function seedAnnouncedTraining(title: string) {
  const sql = postgres(TEST_DATABASE_URL);
  const eventId = crypto.randomUUID();
  const [admin] = await sql`select id from "user" where email = ${ADMIN_EMAIL}`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventId}, ${title}, 'training', now() + interval '2 days', now() + interval '2 days 2 hours', 'Harlington')`;
  await sql`insert into availability_announcement (id, event_id, announced_by_id) values (${crypto.randomUUID()}, ${eventId}, ${admin.id})`;
  await sql.end();
}

test("Home asks about announced Events I haven't replied to, and I answer there", async ({ page, baseURL }) => {
  await signIn(page, baseURL);
  const run = crypto.randomUUID().slice(0, 8);
  const inTitle = `Tuesday training ${run}`;
  const outTitle = `Thursday training ${run}`;
  await seedAnnouncedTraining(inTitle);
  await seedAnnouncedTraining(outTitle);

  await page.goto("/");
  const asks = page.getByRole("region", { name: "Can you make it?" });

  const inCard = asks.getByRole("article", { name: inTitle });
  await inCard.getByRole("button", { name: "I'm in" }).click();
  await expect(page.getByText("You're in", { exact: true })).toBeVisible();
  await expect(inCard).toBeHidden();

  const outCard = asks.getByRole("article", { name: outTitle });
  await outCard.getByRole("button", { name: "I'm out" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Why not?").fill("Exams");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(outCard).toBeHidden();
});
