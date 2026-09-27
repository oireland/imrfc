import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./test-db";

// Start every run from an empty, fully migrated test database.
export default async function globalSetup() {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  const admin = postgres({ ...parts(url), database: "postgres" });
  await admin.unsafe(`drop database if exists "${name}" with (force)`);
  await admin.unsafe(`create database "${name}"`);
  await admin.end();

  const sql = postgres(TEST_DATABASE_URL, { onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });

  // Every spec signs in as this same Admin via magic link (better-auth finds a User
  // by email before creating one). Pre-seeding it already onboarded keeps specs that
  // don't care about onboarding from tripping over the onboarding modal.
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "irelandoliver4@gmail.com";
  await sql`
    insert into "user" (id, name, email, email_verified, role, access_state, preferred_position)
    values (${crypto.randomUUID()}, 'E2E Admin', ${adminEmail}, true, 'admin', 'approved', 'Fly-half')
    on conflict (email) do nothing
  `;

  await sql.end();
}

function parts(url: URL) {
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}
