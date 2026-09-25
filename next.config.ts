import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e runs its own dev server (against the test DB) beside `pnpm dev`; a separate
  // build folder keeps Next's one-dev-server-per-folder lock from refusing it.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
