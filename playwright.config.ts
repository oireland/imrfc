import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./e2e/support/test-db";

const port = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
  // One `next dev` server compiles each route and server action on first hit; more
  // workers than this swamp it and specs time out rather than fail on what they test.
  workers: 4,
  // Head-room for that first compile of a server action.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  // Mobile-first: the app is designed at phone width.
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm next dev --port ${port}`,
    // DEV_SIGN_IN lets specs sign in through /api/dev/sign-in instead of Mailpit, so they run in parallel.
    env: {
      BETTER_AUTH_URL: `http://localhost:${port}`,
      DATABASE_URL: TEST_DATABASE_URL,
      NEXT_DIST_DIR: ".next/e2e",
      DEV_SIGN_IN: "1",
      // A syntactically valid but fake VAPID key so Profile renders the Notifications
      // toggle; e2e specs mock the browser's push APIs rather than reaching a real one.
      NEXT_PUBLIC_VAPID_PUBLIC_KEY:
        "BLc4vXvDESddIn9-x4RQU6ZQDFRDvVsyD5jSjEz-vylhtBoTmMOwn8u9m5ZBjb7lz4jH-7Y_MImBg8SBGgLzKY",
      CRON_SECRET: "e2e-cron-secret",
    },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
