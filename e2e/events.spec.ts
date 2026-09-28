import { expect, test } from "@playwright/test";
import { signIn } from "./support/sign-in";

test("a signed-out visitor is sent to sign in from Events", async ({ page }) => {
  await page.goto("/events");

  await expect(page).toHaveURL(/\/sign-in(\?next=.*)?$/);
});

test("Committee edit a standalone Event's details from its pencil icon", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const in60Days = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  await signIn(page);

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
