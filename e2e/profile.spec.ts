import { expect, test } from "@playwright/test";
import { seedUser, signIn } from "./support/sign-in";

test("Profile saves name and Positions as soon as they change, with no Save button", async ({ page }) => {
  await signIn(page, { email: await seedUser(), next: "/profile" });
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);

  const name = `Robin ${crypto.randomUUID().slice(0, 6)}`;
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Your name").blur();
  await expect(page.getByText("Name saved")).toBeVisible();

  await page.getByLabel("Preferred Position").selectOption("Lock");
  await expect(page.getByText("Positions saved")).toBeVisible();

  // Other Positions start folded away.
  await expect(page.getByLabel("Number 8")).toBeHidden();
  await page.getByRole("button", { name: /Other Positions/ }).click();
  await page.getByLabel("Number 8").check();
  await expect(page.getByText("Positions saved").first()).toBeVisible();

  // The Preferred Position can't also be an Other Position.
  await expect(page.getByLabel("Lock")).toBeDisabled();
  await page.getByLabel("Openside Flanker").check();
  await page.getByLabel("Preferred Position").selectOption("Openside Flanker");
  await expect(page.getByLabel("Openside Flanker")).toBeDisabled();
  await expect(page.getByLabel("Openside Flanker")).not.toBeChecked();
  await expect(page.getByLabel("Lock")).toBeEnabled();
  await page.getByLabel("Preferred Position").selectOption("Lock");

  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByLabel("Preferred Position")).toHaveValue("Lock");
  await page.getByRole("button", { name: /Other Positions/ }).click();
  await expect(page.getByLabel("Number 8")).toBeChecked();
});

test("Profile shows Notifications above the calendar, with help for Google and Apple calendars", async ({ page }) => {
  await signIn(page, { email: await seedUser(), next: "/profile" });

  const headings = await page.getByRole("heading", { level: 3 }).allInnerTexts();
  expect(headings.indexOf("Notifications")).toBeLessThan(headings.indexOf("Your calendar"));

  await expect(page.getByRole("link", { name: /Google Calendar/ })).toHaveAttribute("href", /support\.google\.com/);
  await expect(page.getByRole("link", { name: /Apple Calendar/ })).toHaveAttribute("href", /support\.apple\.com/);
});

test("Profile saves a Mobile number, says so when it's not valid, and can clear it", async ({ page }) => {
  await signIn(page, { email: await seedUser(), next: "/profile" });
  const field = page.getByLabel("Your mobile number");
  await expect(page.getByText("Only Committee see this — it's so they can message you about availability.")).toBeVisible();

  await field.fill("12345");
  await field.blur();
  await expect(page.getByText(/doesn't look like a mobile number/)).toBeVisible();

  await field.fill("07912 345678");
  await field.blur();
  await expect(page.getByText("Number saved")).toBeVisible();
  await page.reload();
  await expect(field).toHaveValue("+447912345678");

  await field.fill("");
  await field.blur();
  await expect(page.getByText("Number removed")).toBeVisible();
});
