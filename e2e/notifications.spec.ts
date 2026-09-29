import { expect, test } from "@playwright/test";
import { signIn } from "./support/sign-in";

/**
 * Stubs the browser push APIs so the toggle's real client code (permission request,
 * service worker registration, PushManager.subscribe) runs end to end without reaching
 * an actual push service — only the server actions and database are real.
 */
async function stubPushApis(page: import("@playwright/test").Page) {
  // A real browser's push subscription persists across page loads; this fake one does
  // too, via localStorage, so a reload correctly reflects whether it's still "subscribed".
  await page.addInitScript(() => {
    const KEY = "e2e-fake-push-subscribed";
    const fakeSubscription = {
      endpoint: "https://push.example.com/e2e",
      toJSON: () => ({ endpoint: "https://push.example.com/e2e", keys: { p256dh: "fake-p256dh", auth: "fake-auth" } }),
      unsubscribe: async () => {
        localStorage.removeItem(KEY);
        return true;
      },
    } as unknown as PushSubscription;

    Object.defineProperty(window, "Notification", {
      value: { requestPermission: async () => "granted", permission: "default" },
      writable: true,
    });
    const registration = {
      pushManager: {
        subscribe: async () => {
          localStorage.setItem(KEY, "1");
          return fakeSubscription;
        },
        getSubscription: async () => (localStorage.getItem(KEY) ? fakeSubscription : null),
      },
    } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: async () => registration, ready: Promise.resolve(registration) },
      writable: true,
    });
  });
}

test("Notifications toggle on Profile subscribes and unsubscribes a device", async ({ page }) => {
  await stubPushApis(page);
  await signIn(page);
  await page.goto("/profile");

  const toggle = page.getByRole("button", { name: "Turn notifications on" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole("button", { name: "Turn notifications off" })).toBeVisible();

  // Still on after a reload — the subscription was saved server-side.
  await page.reload();
  await expect(page.getByRole("button", { name: "Turn notifications off" })).toBeVisible();

  await page.getByRole("button", { name: "Turn notifications off" }).click();
  await expect(page.getByRole("button", { name: "Turn notifications on" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Turn notifications on" })).toBeVisible();
});

test("the morning-of cron route checks its own secret rather than redirecting to sign-in", async ({ playwright }) => {
  const anonymous = await playwright.request.newContext();

  // No session cookie at all — the site-wide auth proxy must not redirect this to /sign-in.
  const noAuth = await anonymous.get("/api/cron/morning-of", { maxRedirects: 0 });
  expect(noAuth.status()).toBe(401);

  const wrongSecret = await anonymous.get("/api/cron/morning-of", {
    headers: { Authorization: "Bearer wrong" },
    maxRedirects: 0,
  });
  expect(wrongSecret.status()).toBe(401);

  const rightSecret = await anonymous.get("/api/cron/morning-of", {
    headers: { Authorization: "Bearer e2e-cron-secret" },
  });
  expect(rightSecret.status()).toBe(200);
  expect(await rightSecret.json()).toEqual({ notified: expect.any(Number) });
});
