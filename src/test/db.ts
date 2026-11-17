import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { onTestFinished } from "vitest";

// Booting PGlite takes seconds; cloning a booted one takes a fraction of that.
// Each worker boots one template, applies every migration to it once, and every test gets its own clone.
let template: Promise<PGlite> | undefined;

async function createTemplate() {
  const client = await PGlite.create();
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return client;
}

/** A fresh, fully migrated in-memory Postgres (PGlite) for the current test; no Docker needed. */
export async function createTestDb() {
  template ??= createTemplate();
  // clone() is typed as the narrower PGliteInterface but returns a full PGlite.
  const client = (await (await template).clone()) as PGlite;
  onTestFinished(() => client.close());
  return drizzle(client);
}
