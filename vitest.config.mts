import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // The first PGlite boot in each worker takes a few seconds, longer when several workers boot at once.
    testTimeout: 60_000,
  },
});
