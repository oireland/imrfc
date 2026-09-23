import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // The first PGlite boot in each worker takes a few seconds.
    testTimeout: 15_000,
  },
});
