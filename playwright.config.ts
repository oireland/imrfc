import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./e2e/support/test-db";

const port = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
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
    env: { BETTER_AUTH_URL: `http://localhost:${port}`, DATABASE_URL: TEST_DATABASE_URL, NEXT_DIST_DIR: ".next/e2e" },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
