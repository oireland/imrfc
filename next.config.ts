import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e runs its own dev server (against the test DB) beside `pnpm dev`; a separate
  // build folder keeps Next's one-dev-server-per-folder lock from refusing it.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // HTML emails attach the crest from disk (src/lib/mail.ts); ship it with the functions.
  outputFileTracingIncludes: { "/*": ["./src/app/icon.png"] },
  experimental: {
    // Keep visited pages (dynamic) and prefetched tabs (static) in the client router cache, so going
    // back to one is instant. Server actions' revalidatePath clears it, so your own edits show at once;
    // someone else's can take up to a minute.
    staleTimes: { dynamic: 30, static: 60 },
  },
};

export default nextConfig;
