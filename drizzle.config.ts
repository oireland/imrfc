import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  // Each feature owns its tables in its own schema.ts.
  schema: "./src/features/*/schema.ts",
  out: "./drizzle",
  // Migrations need a direct connection; Neon's pooled DATABASE_URL is for app traffic.
  dbCredentials: { url: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)! },
});
