import path from "node:path";
import { migrate as drizzleMigrate } from "drizzle-orm/pglite/migrator";
import type { createTestDb } from "./db";

/** Applies every generated migration to a test database. */
export async function migrate(db: Awaited<ReturnType<typeof createTestDb>>) {
  await drizzleMigrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
