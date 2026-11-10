import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // These need a real Postgres server; `pnpm test:pg` runs them.
    exclude: [...configDefaults.exclude, "src/**/*.pg.test.ts"],
    environment: "node",
    // Each worker boots its own PGlite; on many-core machines the default worker count starves them into timeouts.
    maxWorkers: 6,
    // The first PGlite boot in each worker takes a few seconds, longer when several workers boot at once.
    testTimeout: 60_000,
  },
});
