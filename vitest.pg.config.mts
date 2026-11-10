import { defineConfig } from "vitest/config";

/** Tests that need a real Postgres server (`docker compose up` locally, a service in CI). */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.pg.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
