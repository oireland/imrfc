import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { ADMIN_EMAIL, signIn } from "./support/sign-in";

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

test("Home asks about announced Events I haven't replied to, and I answer there", async ({ page }) => {
  await signIn(page);
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
