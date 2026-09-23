import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createTestDb } from "./db";

it("gives a Postgres database that runs queries", async () => {
  const db = await createTestDb();

  const result = await db.execute<{ answer: number }>(sql`select 6 * 7 as answer`);

  expect(result.rows).toEqual([{ answer: 42 }]);
});

it("gives each test its own database", async () => {
  const first = await createTestDb();
  const second = await createTestDb();

  await first.execute(sql`create table scratch (id int)`);

  await expect(second.execute(sql`select * from scratch`)).rejects.toMatchObject({
    cause: { message: 'relation "scratch" does not exist' },
  });
});
