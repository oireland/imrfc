import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./support/test-db";
import { signIn } from "./support/sign-in";

async function assertNoHorizontalScroll(page: Page) {
  const overflowing = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowing).toBe(false);
}

async function axeReport(page: Page, screen: string): Promise<string | null> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  if (results.violations.length === 0) return null;
  const details = results.violations
    .map(
      (v) =>
        `\n  - [${v.id}] ${v.help}\n` +
        v.nodes.map((n) => `      target: ${n.target.join(" ")}${n.any[0]?.data?.fgColor ? ` (${n.any[0].data.fgColor} on ${n.any[0].data.bgColor}, ${n.any[0].data.contrastRatio}:1) "${n.html.slice(0, 80)}"` : ""}`).join("\n"),
    )
    .join("");
  return `${screen}:${details}`;
}

test.describe("Design pass: every screen is accessible at phone width, light and dark", () => {
  // Signed-in tests share one Mailpit inbox for magic links; run them one at a
  // time so a parallel run doesn't race for the same link.
  test.describe.configure({ mode: "serial" });

  let sql: ReturnType<typeof postgres>;
  let eventId: string;
  let equipmentId: string;

  test.beforeAll(async () => {
    sql = postgres(TEST_DATABASE_URL);
    const run = crypto.randomUUID().slice(0, 8);
    const store = crypto.randomUUID();
    equipmentId = crypto.randomUUID();
    eventId = crypto.randomUUID();
    const list = crypto.randomUUID();
    await sql`insert into store (id, name, address) values (${store}, ${`Shed ${run}`}, 'x')`;
    await sql`insert into equipment_unit (id, name, home_id) values (${equipmentId}, ${`Ball bag ${run}`}, ${store})`;
    await sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id) values (${crypto.randomUUID()}, ${equipmentId}, 1, 'store', ${store})`;
    await sql`insert into event (id, title, event_type, start, "end", venue)
      values (${eventId}, ${`Training ${run}`}, 'training', now() + interval '1 day', now() + interval '1 day 2 hours', 'Harlington')`;
    await sql`insert into checklist (id, scope, scope_id) values (${list}, 'event', ${eventId})`;
    await sql`insert into checklist_item (id, checklist_id, equipment_unit_id) values (${crypto.randomUUID()}, ${list}, ${equipmentId})`;
  });

  test.afterAll(async () => {
    await sql.end();
  });

  // "light" / "dark" follow the device (the default System theme); "chosen dark" is
  // the crest menu's Dark choice (<html data-theme="dark">) on a light device.
  for (const mode of ["light", "dark", "chosen dark"] as const) {
    test(`signed-in screens have no axe violations (${mode})`, async ({ page }) => {
      // Visits and scans every screen (~2s each), well past the default 30s.
      test.setTimeout(120_000);
      await page.emulateMedia({ colorScheme: mode === "dark" ? "dark" : "light" });
      await signIn(page);

      const screens = [
        "/",
        "/events",
        "/events?tab=past",
        `/events/${eventId}`,
        "/equipment",
        `/equipment/${equipmentId}`,
        "/stores",
        "/profile",
        "/admin",
        "/admin/equipment",
        "/events/import",
        "/admin/series",
        "/admin/checklists",
        "/admin/users",
      ];

      const reports: string[] = [];
      for (const screen of screens) {
        await page.goto(screen);
        if (mode === "chosen dark") await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
        await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
        // Native dropdowns and date pickers must open in the same theme as the page.
        const colorScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
        expect(colorScheme, screen).toBe(mode === "light" ? "light" : "dark");
        await assertNoHorizontalScroll(page);
        const report = await axeReport(page, screen);
        if (report) reports.push(report);
      }
      expect(reports, `Accessibility violations found:\n${reports.join("\n")}`).toEqual([]);
    });
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`signed-out sign-in screen has no axe violations (${colorScheme})`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto("/sign-in");
      await assertNoHorizontalScroll(page);
      const report = await axeReport(page, "/sign-in (signed out)");
      expect(report, report ?? undefined).toBeNull();
      await context.close();
    });
  }
});
