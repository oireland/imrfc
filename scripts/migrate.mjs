// Applies the migrations in ./drizzle. Used instead of `drizzle-kit migrate`, which exits 1 without
// saying why when a migration fails (e.g. 0034 refusing to install over Equipment Units whose
// portions don't add up). Same migrator and bookkeeping table, so the two are interchangeable.
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());

// Migrations need a direct connection; Neon's pooled DATABASE_URL is for app traffic.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) to migrate.");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} catch (error) {
  const pg = error?.cause ?? error;
  console.error(`Migration failed: ${pg.message ?? error}`);
  for (const field of ["detail", "hint", "where"]) if (pg[field]) console.error(`  ${field}: ${pg[field]}`);
  console.error("Nothing was applied: every pending migration runs in one transaction.");
  process.exitCode = 1;
} finally {
  await client.end();
}
