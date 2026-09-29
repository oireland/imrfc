import { chromium } from "@playwright/test";
import postgres from "postgres";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = "irelandoliver4@gmail.com";
const DATABASE_URL = "postgres://imrfc:imrfc@localhost:5432/imrfc";

// Push API needs a real (non-incognito) profile, so use a persistent context.
const userDataDir = mkdtempSync(join(tmpdir(), "verify-push-"));
const context = await chromium.launchPersistentContext(userDataDir, { permissions: ["notifications"] });
const page = context.pages()[0] ?? (await context.newPage());
page.on("console", (msg) => console.log("[page]", msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto(`${BASE}/api/dev/sign-in?email=${encodeURIComponent(ADMIN_EMAIL)}&next=/profile`);
await page.waitForURL((u) => !u.pathname.startsWith("/api/"));
console.log("Signed in, landed on", page.url());

await page.waitForSelector("text=Notifications");
const onButton = page.getByRole("button", { name: "Turn notifications on" });
console.log("onButton visible?", await onButton.isVisible());
try {
  await onButton.click();
  console.log("clicked");
} catch (e) {
  console.log("click failed:", e.message);
}
await page.waitForTimeout(2000);
console.log("button text now:", await page.locator("button", { hasText: /notifications/i }).innerText());
console.log("body text snippet:", (await page.locator("body").innerText()).slice(0, 2000));
await page.getByRole("button", { name: "Turn notifications off" }).waitFor({ timeout: 15000 });
console.log("Subscribed to push");

// Watch the service worker for the push it receives.
const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
sw.on("console", (msg) => console.log("[sw]", msg.text()));

// Seed a Training today with a Duty claimed by the signed-in Admin.
const sql = postgres(DATABASE_URL);
const [admin] = await sql`select id from "user" where email = ${ADMIN_EMAIL}`;
const [store] = await sql`select id from store limit 1`;
let storeId = store?.id;
if (!storeId) {
  storeId = crypto.randomUUID();
  await sql`insert into store (id, name, address) values (${storeId}, 'Verify Store', 'x')`;
}
const equipmentId = crypto.randomUUID();
await sql`insert into equipment_unit (id, name, home_id, status, quantity) values (${equipmentId}, 'Verify Balls', ${storeId}, 'active', 1)`;
await sql`insert into equipment_portion (id, equipment_unit_id, store_id, holder_id, count) values (${crypto.randomUUID()}, ${equipmentId}, ${storeId}, null, 1)`;

const eventId = crypto.randomUUID();
const now = new Date();
const start = new Date(now); start.setHours(now.getHours() + 1);
const end = new Date(start); end.setHours(start.getHours() + 1);
await sql`insert into event (id, title, event_type, start, "end", venue, notes, cancelled)
  values (${eventId}, 'Verify Training', 'training', ${start}, ${end}, 'Harlington', '', false)`;

const dutyToId = crypto.randomUUID();
await sql`insert into duty (id, event_id, equipment_unit_id, direction) values (${dutyToId}, ${eventId}, ${equipmentId}, 'to')`;
await sql`insert into duty_user (id, duty_id, user_id) values (${crypto.randomUUID()}, ${dutyToId}, ${admin.id})`;
const dutyFromId = crypto.randomUUID();
await sql`insert into duty (id, event_id, equipment_unit_id, direction) values (${dutyFromId}, ${eventId}, ${equipmentId}, 'from')`;
await sql`insert into duty_user (id, duty_id, user_id) values (${crypto.randomUUID()}, ${dutyFromId}, ${admin.id})`;
console.log("Seeded a today Training with a Duty for the Admin");

const cronSecret = process.env.CRON_SECRET;
const res = await fetch(`${BASE}/api/cron/morning-of`, { headers: { Authorization: `Bearer ${cronSecret}` } });
console.log("Cron response:", res.status, await res.text());

// Give the push a moment to arrive and the SW to show it.
await page.waitForTimeout(3000);
const shown = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  const notifications = await reg.getNotifications();
  return notifications.map((n) => ({ title: n.title, body: n.body }));
});
console.log("Notifications shown:", JSON.stringify(shown));

await sql.end();
await context.close();
