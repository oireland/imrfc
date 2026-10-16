import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Any Drizzle Postgres database or transaction: the postgres-js client the app runs on, the
 * PGlite client the tests run on, and the `tx` inside either one's `transaction()`.
 */
export type Db = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;
