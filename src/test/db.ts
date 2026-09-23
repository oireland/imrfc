import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { onTestFinished } from "vitest";

// Booting PGlite takes seconds; cloning a booted one takes a fraction of that.
// Each worker boots one template and every test gets its own clone.
let template: Promise<PGlite> | undefined;

/** A fresh in-memory Postgres (PGlite) for the current test; no Docker needed. */
export async function createTestDb() {
  template ??= PGlite.create();
  // clone() is typed as the narrower PGliteInterface but returns a full PGlite.
  const client = (await (await template).clone()) as PGlite;
  onTestFinished(() => client.close());
  return drizzle(client);
}
