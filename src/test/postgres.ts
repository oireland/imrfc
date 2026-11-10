import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { onTestFinished } from "vitest";

/**
 * Where the real-Postgres tests create their scratch databases. Locally that's the Docker Compose
 * Postgres (`docker compose up`); CI points it at a Postgres service.
 */
const serverUrl = process.env.TEST_DATABASE_URL ?? "postgres://imrfc:imrfc@localhost:5432/imrfc";

/**
 * A fresh, migrated database on a real Postgres server, dropped when the test finishes. Unlike
 * PGlite, which runs over a single connection, it has a pool of connections, so concurrent
 * transactions really do contend for locks.
 */
export async function createPostgresTestDb() {
  const name = `imrfc_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = postgres(serverUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const client = postgres(url.toString(), { max: 10, onnotice: () => {} });
  onTestFinished(async () => {
    await client.end();
    await admin.unsafe(`drop database ${name} with (force)`);
    await admin.end();
  });

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, client };
}

/** How many connections to this database are waiting for a lock. */
export async function lockWaiters(client: postgres.Sql): Promise<number> {
  const [{ count }] = await client<{ count: number }[]>`
    select count(*)::int as count from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'`;
  return count;
}

/** Polls until `condition` holds, failing after `timeoutMs`. */
export async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
