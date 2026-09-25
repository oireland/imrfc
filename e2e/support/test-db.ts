// e2e runs against its own database so test rows never land in the dev DB.
// Same Docker Postgres as `pnpm dev`, different database.
export const TEST_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://imrfc:imrfc@localhost:5432/imrfc_test";
