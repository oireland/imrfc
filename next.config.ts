import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e runs its own dev server (against the test DB) beside `pnpm dev`; a separate
  // build folder keeps Next's one-dev-server-per-folder lock from refusing it.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // HTML emails attach the crest from disk (src/lib/mail.ts); ship it with the functions.
  outputFileTracingIncludes: { "/*": ["./src/app/icon.png"] },
};

export default nextConfig;
