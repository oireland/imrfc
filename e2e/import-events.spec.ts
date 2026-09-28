import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Committee import events from a CSV, with the format explained and a template to download", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const venueName = `Pitch ${run}`;
  await signIn(page);

  await page.goto("/events");
  await page.getByRole("link", { name: "Import from CSV" }).click();
  await expect(page.getByRole("heading", { name: "Import events" })).toBeVisible();

  await page.getByRole("button", { name: "What goes in the file" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("The header row is required")).toBeVisible();
  await expect(dialog.getByText("1st XV, 2nd XV")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download the template" }).click();
  expect((await download).suggestedFilename()).toBe("events-template.csv");

  const file = page.getByLabel("CSV file");
  await file.setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(`${venueName},training\n`) });
  await page.getByRole("button", { name: "Import events" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Nothing was imported" })).toContainText("The first row must be the header row");

  // A random far-future day, so repeated runs don't Clash with each other.
  const day = new Date(Date.UTC(2031 + Math.floor(Math.random() * 20), 4, 1 + Math.floor(Math.random() * 28)))
    .toISOString()
    .slice(0, 10);
  const csv = [
    "title,type,date,start_time,end_time,venue,opponent",
    `Training ${run},training,${day},18:00,20:00,${venueName},`,
    `Match ${run},match,${day},20:30,22:00,${venueName},UCL Medics`,
  ].join("\n");
  await file.setInputFiles({ name: "events.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import events" }).click();
  await expect(page.getByText("2 events imported")).toBeVisible();
  await expect(page).toHaveURL(/\/events$/);

  const rows = await sql`select venue from event where title in (${`Training ${run}`}, ${`Match ${run}`})`;
  expect(rows.map((r) => r.venue)).toEqual([venueName, venueName]);
  await sql.end();
});
