import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

test("Committee add Equipment Units and Events from the Equipment and Events pages, with a confirmation toast", async ({
  page,
 
}) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const storeName = `Locker ${run}`;
  const venueName = `Pitch ${run}`;
  await sql`insert into store (id, name, address) values (${crypto.randomUUID()}, ${storeName}, 'x')`;
  await signIn(page);

  const equipmentName = `Cones ${run}`;
  await page.goto("/equipment");
  await page.getByRole("button", { name: "Add equipment" }).click();
  const equipmentSheet = page.getByRole("dialog");
  await equipmentSheet.getByLabel("Name").fill(equipmentName);
  await equipmentSheet.getByLabel("Home").selectOption({ label: storeName });
  await equipmentSheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Equipment added")).toBeVisible();
  await expect(page).toHaveURL(/\/equipment$/);
  await page.getByRole("button", { name: `I've got ${equipmentName}` }).click();
  await expect(page.getByRole("region", { name: "With you" }).getByRole("link", { name: equipmentName })).toBeVisible();

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

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await sql.end();
});
