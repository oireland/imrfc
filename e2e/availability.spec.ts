import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { MAILPIT, magicLink, signIn } from "./support/sign-in";

/** The real magic-link flow from the sign-in page, as `email` (its own User, so parallel specs can't cross links). */
async function finishSignIn(page: Page, baseURL: string | undefined, email: string) {
  const asked = Date.now() - 1000;
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = new URL(await magicLink(email, asked));
  await page.goto(new URL(link.pathname + link.search, baseURL).toString());
}

async function seedTraining(title: string) {
  const sql = postgres(TEST_DATABASE_URL);
  const eventId = crypto.randomUUID();
  const playerName = `Jo ${title.split(" ").pop()}`;
  await sql`insert into event (id, title, event_type, start, "end", venue)
    values (${eventId}, ${title}, 'training', now() + interval '2 days', now() + interval '2 days 2 hours', 'Harlington')`;
  await sql`insert into "user" (id, name, email, email_verified, access_state, preferred_position)
    values (${crypto.randomUUID()}, ${playerName}, ${`${eventId}@x.org`}, true, 'approved', 'Hooker')`;
  await sql.end();
  return { eventId, playerName };
}

test("a Player says whether they can make Training, and Committee replies for someone else", async ({ page }) => {
  const title = `Training ${crypto.randomUUID().slice(0, 8)}`;
  const { eventId, playerName } = await seedTraining(title);

  await signIn(page);
  await page.goto(`/events/${eventId}`);
  const card = page.getByRole("region", { name: "Who's coming" });

  await card.getByRole("button", { name: "I'm in" }).click();
  await expect(page.getByText("You're in", { exact: true }).first()).toBeVisible();
  await expect(card.getByRole("tabpanel")).toContainText("E2E Admin (you)");

  await card.getByRole("button", { name: "I'm out" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Why not?").fill("Exams");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await card.getByRole("tab", { name: /Out/ }).click();
  await expect(card.getByRole("tabpanel")).toContainText("Exams");

  await card.getByRole("tab", { name: /No reply/ }).click();
  await card.getByRole("button", { name: `Reply for ${playerName}` }).click();
  await sheet.getByRole("radio", { name: "In" }).click();
  await sheet.getByLabel(/Anything to add/).fill("late");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`Saved for ${playerName}`)).toBeVisible();
  await card.getByRole("tab", { name: /^In/ }).click();
  await expect(card.getByRole("tabpanel")).toContainText(`${playerName}late · set by E2E Admin`);
});

test("a shared Event link previews only its title and date, and signing in lands back on it", async ({ page, baseURL, playwright }) => {
  const title = `Training ${crypto.randomUUID().slice(0, 8)}`;
  const { eventId } = await seedTraining(title);

  // What WhatsApp sees: no session, follows the redirect, reads the tags.
  const crawler = await playwright.request.newContext({ baseURL, userAgent: "WhatsApp/2.23.20.0" });
  const html = await (await crawler.get(`/events/${eventId}`)).text();
  expect(html).toContain(`<meta property="og:title" content="${title}"/>`);
  expect(html).not.toContain("Harlington");
  await crawler.dispose();

  await page.goto(`/events/${eventId}`);
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  // The seeded Player signs in, so this doesn't share a Mailpit inbox with other specs.
  await finishSignIn(page, baseURL, `${eventId}@x.org`);
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
  await expect(page.getByText(title).first()).toBeVisible();
});

async function mailTo(email: string, subject: RegExp) {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const found = (list.messages ?? []).find((m: { Subject: string }) => subject.test(m.Subject));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email matching ${subject} reached ${email}`);
}

test("Committee announce Training with a reply-by, nudge someone, and copy the chase message", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const title = `Training ${crypto.randomUUID().slice(0, 8)}`;
  const { eventId, playerName } = await seedTraining(title);
  const playerEmail = `${eventId}@x.org`;

  await signIn(page);
  await page.goto(`/events/${eventId}`);
  const card = page.getByRole("region", { name: "Who's coming" });

  await card.getByRole("button", { name: "Announce" }).click();
  const sheet = page.getByRole("dialog");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await sheet.getByLabel("Reply by (optional)").fill(tomorrow);
  await sheet.getByRole("button", { name: /^Email \d+ (person|people)$/ }).click();
  await expect(page.getByText(/^Announced\. Emailed/)).toBeVisible();
  await expect(card).toContainText(/Announced \w{3} \d+ \w{3} by E2E Admin · reply by/);
  await expect(card.getByRole("button", { name: "Announce" })).toBeHidden();
  const announced = await mailTo(playerEmail, new RegExp(`^Can you make it\\? .* — ${title}$`));
  expect(announced.Snippet).toContain("Reply now");

  await card.getByRole("button", { name: "Nudge" }).click();
  await sheet.getByRole("button", { name: "Untick all" }).click();
  await sheet.getByRole("checkbox", { name: playerName }).check();
  await sheet.getByRole("button", { name: "Nudge 1 person" }).click();
  await expect(page.getByText("Nudged 1 person.")).toBeVisible();
  await mailTo(playerEmail, new RegExp(`^Still need your answer: .* — ${title}$`));
  await card.getByRole("tab", { name: /No reply/ }).click();
  await expect(card.getByRole("button", { name: `Reply for ${playerName}` })).toContainText("nudged just now");

  await card.getByRole("button", { name: "Copy chase message" }).click();
  await expect(page.getByText("Copied. Paste it into the club group.")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`— ${title}\nStill need a reply from:`);
  expect(copied).toContain(playerName);
});
