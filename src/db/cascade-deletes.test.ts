import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

// A feature's own child rows go with their parent, so deleting the parent is one statement.
// Foreign keys from other features stay NO ACTION (see event-foreign-keys.test.ts).
const CASCADING: [string, string, string][] = [
  ["checklist_item", "checklist_id", "checklist"],
  ["duty_user", "duty_id", "duty"],
  ["injury_change", "injury_id", "injury"],
  ["match_details", "event_id", "event"],
  // Sign-ins and Feed Tokens, though a User row is erased rather than deleted, so these don't fire.
  ["account", "user_id", '"user"'],
  ["feed_token", "user_id", '"user"'],
  ["session", "user_id", '"user"'],
];

describe("cascading foreign keys", () => {
  it("are only the ones that take a parent's own child rows with it", async () => {
    const db = await createTestDb();

    const { rows } = await db.execute(sql`
      select c.conrelid::regclass::text as table, a.attname as column, c.confrelid::regclass::text as parent
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.confdeltype = 'c'`);

    expect(rows.map((r) => [r.table, r.column, r.parent]).sort()).toEqual([...CASCADING].sort());
  });
});
