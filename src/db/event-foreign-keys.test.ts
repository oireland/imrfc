import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/types";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { migrate } from "@/test/migrate";

// pg_constraint.confdeltype: "a" is NO ACTION, "n" is SET NULL.
const EXPECTED: [string, string, string][] = [
  ["availability_announcement", "event_id", "a"],
  ["availability_ask", "event_id", "a"],
  ["availability_messaged", "event_id", "a"],
  ["availability_nudge", "event_id", "a"],
  ["availability_reply", "event_id", "a"],
  ["duty", "event_id", "a"],
  ["equipment_portion", "last_seen_event_id", "a"],
  ["injury", "event_id", "n"],
  ["selection_notice", "event_id", "a"],
  ["selection_pitch", "event_id", "a"],
  ["selection_sent", "event_id", "a"],
  ["selection_shirt", "event_id", "a"],
  ["team_naming", "event_id", "a"],
];

type Database = Awaited<ReturnType<typeof createTestDb>>;

async function eventForeignKeys(db: Database) {
  const { rows } = await db.execute(sql`
    select c.conname as name, c.conrelid::regclass::text as table, a.attname as column, c.confdeltype as action
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'event'::regclass
      and c.conrelid::regclass::text not in ('event_team', 'match_details')`);
  return rows as { name: string; table: string; column: string; action: string }[];
}

describe("Event foreign keys", () => {
  it("every column holding an Event id references the Event", async () => {
    const db = await createTestDb();
    await migrate(db);

    const found = (await eventForeignKeys(db)).map((k) => [k.table, k.column, k.action]);

    expect(found.sort()).toEqual([...EXPECTED].sort());
  });

  it("the database rejects a row for an Event that doesn't exist", async () => {
    const db = await createTestDb();
    await migrate(db);

    await expect(db.execute(sql`insert into selection_pitch (event_id, shirt_count) values ('no-such-event', 23)`)).rejects.toThrow();
  });

  it("the migration clears rows left behind by Events deleted before the constraints existed", async () => {
    const db = await createTestDb();
    await migrate(db);
    for (const { table, name } of await eventForeignKeys(db)) {
      await db.execute(sql.raw(`alter table ${table} drop constraint "${name}"`));
    }
    await db.execute(sql`insert into "user" (id, name, email, email_verified) values ('u', 'U', 'u@example.com', true)`);
    await db.execute(sql`insert into store (id, name, address) values ('shed', 'Shed', 'x')`);
    await db.transaction(async (tx: Db) => {
      await tx.execute(sql`insert into equipment_unit (id, name, home_id, quantity) values ('merged', 'Shields', 'shed', 8), ('alone', 'Ball bag', 'shed', 1)`);
      await tx.execute(sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id, last_seen_event_id) values
        ('p1', 'merged', 5, 'store', 'shed', null),
        ('p2', 'merged', 3, 'unconfirmed', null, 'gone'),
        ('p3', 'alone', 1, 'unconfirmed', null, 'gone')`);
    });
    await db.execute(sql`insert into duty (id, event_id, equipment_unit_id, direction) values ('d', 'gone', 'alone', 'to')`);
    await db.execute(sql`insert into duty_user (id, duty_id, user_id) values ('du', 'd', 'u')`);
    await db.execute(sql`insert into selection_pitch (event_id, shirt_count) values ('gone', 23)`);
    await db.execute(sql`insert into injury (id, user_id, area, happened_on, event_id, status, reported_by_id) values ('i', 'u', 'Knee', '2026-01-01', 'gone', 'out', 'u')`);

    const migration = path.join(process.cwd(), "drizzle", "0033_event-foreign-keys.sql");
    for (const statement of readFileSync(migration, "utf8").split("--> statement-breakpoint")) {
      await db.execute(sql.raw(statement));
    }

    const portions = (await db.execute(sql`select equipment_unit_id as unit, count, whereabouts_type as type, store_id as store from equipment_portion order by 1`)).rows;
    expect(portions).toEqual([
      { unit: "alone", count: 1, type: "store", store: "shed" },
      { unit: "merged", count: 8, type: "store", store: "shed" },
    ]);
    expect((await db.execute(sql`select id from duty`)).rows).toEqual([]);
    expect((await db.execute(sql`select id from duty_user`)).rows).toEqual([]);
    expect((await db.execute(sql`select event_id from selection_pitch`)).rows).toEqual([]);
    expect((await db.execute(sql`select event_id from injury`)).rows).toEqual([{ event_id: null }]);
  });
});
