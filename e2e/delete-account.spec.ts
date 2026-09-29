import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { seedUser, signIn } from "./support/sign-in";

test("a User deletes their own account from Profile and can't get back in", async ({ page }) => {
  const email = await seedUser();
  await signIn(page, { email, next: "/profile" });

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Yes, delete it" }).click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("an Admin deletes a Member's account from Users, but not another Admin's", async ({ page }) => {
  const sql = postgres(TEST_DATABASE_URL);
  const run = crypto.randomUUID().slice(0, 8);
  const memberEmail = `member-${run}@example.com`;
  const adminEmail = `admin-${run}@example.com`;
  await sql`insert into "user" (id, name, email, email_verified, role, access_state, preferred_position) values
    (${crypto.randomUUID()}, ${`Member ${run}`}, ${memberEmail}, true, 'member', 'approved', 'Wing'),
    (${crypto.randomUUID()}, ${`Admin ${run}`}, ${adminEmail}, true, 'admin', 'approved', 'Wing')`;
  await sql.end();

  await signIn(page, { next: "/admin/users" });
  const row = (email: string) => page.locator(".divide-y > div").filter({ hasText: email });

  await expect(row(adminEmail).getByRole("button", { name: "Delete" })).toHaveCount(0);

  await row(memberEmail).getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Delete Member ${run}'s account?`);
  await page.getByRole("button", { name: "Yes, delete it" }).click();

  await expect(page.getByText(memberEmail)).toHaveCount(0);
});
