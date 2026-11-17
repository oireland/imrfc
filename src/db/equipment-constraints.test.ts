import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/types";
import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

/** Eight shields, all in the shed; written directly, as a bad script or console session would. */
async function seedShields() {
  const db = await createTestDb();
  await db.execute(sql`insert into "user" (id, name, email, email_verified) values ('sam', 'Sam', 'sam@example.com', true)`);
  await db.execute(sql`insert into store (id, name, address) values ('shed', 'Shed', 'x')`);
  await db.transaction(async (tx: Db) => {
    await tx.execute(sql`insert into equipment_unit (id, name, home_id, quantity) values ('shields', 'Shields', 'shed', 8)`);
    await tx.execute(sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id) values ('p1', 'shields', 8, 'store', 'shed')`);
  });
  return db;
}

/** The database's own message for a rejected write (Drizzle wraps it as the cause). */
async function rejection(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (error) {
    const { message, cause } = error as Error & { cause?: Error };
    return cause?.message ?? message;
  }
  throw new Error("The write was accepted");
}

describe("Equipment rules enforced by the database", () => {
  describe("an Equipment Unit's portions add up to its Quantity", () => {
    it("rejects changing a portion's count so the total no longer matches", async () => {
      const db = await seedShields();

      expect(await rejection(db.execute(sql`update equipment_portion set count = 7 where id = 'p1'`))).toMatch(/portions but a Quantity of/);
    });

    it("rejects raising the Quantity without adding the extra anywhere", async () => {
      const db = await seedShields();

      expect(await rejection(db.execute(sql`update equipment_unit set quantity = 9 where id = 'shields'`))).toMatch(/portions but a Quantity of/);
    });

    it("rejects deleting a portion", async () => {
      const db = await seedShields();

      expect(await rejection(db.execute(sql`delete from equipment_portion where id = 'p1'`))).toMatch(/portions but a Quantity of/);
    });

    it("rejects a new Equipment Unit with nothing anywhere", async () => {
      const db = await seedShields();

      expect(await rejection(db.execute(sql`insert into equipment_unit (id, name, home_id, quantity) values ('bag', 'Ball bag', 'shed', 1)`))).toMatch(/portions but a Quantity of/);
    });

    it("checks at commit, so replacing every portion inside one transaction is allowed", async () => {
      const db = await seedShields();

      await db.transaction(async (tx: Db) => {
        await tx.execute(sql`delete from equipment_portion where equipment_unit_id = 'shields'`);
        await tx.execute(sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id) values ('p2', 'shields', 5, 'store', 'shed')`);
        await tx.execute(sql`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, holder_id) values ('p3', 'shields', 3, 'holder', 'sam')`);
      });

      const { rows } = await db.execute(sql`select sum(count)::int as total from equipment_portion where equipment_unit_id = 'shields'`);
      expect(rows).toEqual([{ total: 8 }]);
    });

    it("allows removing an Equipment Unit together with its portions, as test clean-up does", async () => {
      const db = await seedShields();

      await db.transaction(async (tx: Db) => {
        await tx.execute(sql`delete from equipment_portion where equipment_unit_id = 'shields'`);
        await tx.execute(sql`delete from equipment_unit where id = 'shields'`);
      });

      expect((await db.execute(sql`select id from equipment_unit`)).rows).toEqual([]);
    });

    describe("the migration that adds this rule", () => {
      /** Shields as `seedShields` makes them, with the rule taken out again so bad data can be written first. */
      async function beforeMigration() {
        const db = await seedShields();
        await db.execute(sql`drop trigger equipment_portion_total_matches_quantity on equipment_portion`);
        await db.execute(sql`drop trigger equipment_unit_total_matches_quantity on equipment_unit`);
        await db.execute(sql`drop function equipment_total_matches_quantity`);
        return db;
      }

      /** Runs migration 0034 in one transaction, as the migrator does. */
      async function runMigration(db: Db) {
        const migration = readFileSync(path.join(process.cwd(), "drizzle", "0034_equipment-total-matches-quantity.sql"), "utf8");
        await db.transaction(async (tx: Db) => {
          for (const statement of migration.split("--> statement-breakpoint")) await tx.execute(sql.raw(statement));
        });
      }

      it("refuses to run over totals that are already wrong", async () => {
        const db = await beforeMigration();
        await db.execute(sql`update equipment_portion set count = 7 where id = 'p1'`);

        expect(await rejection(runMigration(db))).toMatch(/shields has 7 across its portions but a Quantity of 8/);
      });

      it("puts an Equipment Unit that has nothing anywhere and has never moved back at its Home", async () => {
        const db = await beforeMigration();
        await db.execute(sql`insert into equipment_unit (id, name, home_id, quantity) values ('cones', 'Cones', 'shed', 1)`);

        await runMigration(db);

        const { rows } = await db.execute(
          sql`select count, whereabouts_type, store_id from equipment_portion where equipment_unit_id = 'cones'`,
        );
        expect(rows).toEqual([{ count: 1, whereabouts_type: "store", store_id: "shed" }]);
      });

      it("still refuses one with nothing anywhere if it has moved, since it may not be at Home", async () => {
        const db = await beforeMigration();
        await db.execute(sql`insert into equipment_unit (id, name, home_id, quantity) values ('cones', 'Cones', 'shed', 1)`);
        await db.execute(sql`insert into movement_log_entry (id, equipment_unit_id, kind, user_id, reason, count, to_type, to_holder_id)
          values ('m1', 'cones', 'move', 'sam', 'ad_hoc', 1, 'holder', 'sam')`);

        expect(await rejection(runMigration(db))).toMatch(/cones has 0 across its portions but a Quantity of 1/);
      });
    });
  });

  describe("each row holds valid values", () => {
    const portion = (values: string) =>
      sql.raw(`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id, holder_id, last_seen_event_id) values ${values}`);

    it("rejects a portion with a count of zero or less", async () => {
      const db = await seedShields();

      const write = db.transaction(async (tx: Db) => {
        await tx.execute(sql`update equipment_portion set count = 8 where id = 'p1'`);
        await tx.execute(portion(`('p0', 'shields', 0, 'store', 'shed', null, null)`));
      });

      expect(await rejection(write)).toMatch(/equipment_portion_count_positive/);
    });

    it("rejects an Equipment Unit with a Quantity below 1", async () => {
      const db = await seedShields();

      expect(await rejection(db.execute(sql`insert into equipment_unit (id, name, home_id, quantity) values ('none', 'None', 'shed', 0)`))).toMatch(
        /equipment_unit_quantity_positive/,
      );
    });

    it.each([
      ["a Store portion with no Store", `('px', 'shields', 1, 'store', null, null, null)`],
      ["a Store portion that also names a Holder", `('px', 'shields', 1, 'store', 'shed', 'sam', null)`],
      ["a Holder portion with no Holder", `('px', 'shields', 1, 'holder', null, null, null)`],
      ["a Holder portion that also names a Store", `('px', 'shields', 1, 'holder', 'shed', 'sam', null)`],
      ["an Unconfirmed portion with no Event", `('px', 'shields', 1, 'unconfirmed', null, null, null)`],
      ["a Store portion with a last-seen Event", `('px', 'shields', 1, 'store', 'shed', null, 'match')`],
      ["a portion at an unknown kind of Place", `('px', 'shields', 1, 'lost', 'shed', null, null)`],
    ])("rejects %s", async (_, values) => {
      const db = await seedShields();
      await db.execute(sql`insert into event (id, title, event_type, start, "end", venue) values ('match', 'Match', 'match', now(), now(), 'Harlington')`);

      expect(await rejection(db.execute(portion(values)))).toMatch(/equipment_portion_one_place/);
    });

    it.each([
      ["equipment_unit", "status", sql`update equipment_unit set status = 'broken' where id = 'shields'`],
      [
        "movement_log_entry",
        "kind",
        sql`insert into movement_log_entry (id, equipment_unit_id, kind, user_id) values ('m', 'shields', 'teleport', 'sam')`,
      ],
      [
        "movement_log_entry",
        "reason",
        sql`insert into movement_log_entry (id, equipment_unit_id, kind, user_id, reason) values ('m', 'shields', 'move', 'sam', 'whim')`,
      ],
      [
        "movement_log_entry",
        "from_type",
        sql`insert into movement_log_entry (id, equipment_unit_id, kind, user_id, from_type) values ('m', 'shields', 'move', 'sam', 'nowhere')`,
      ],
      [
        "movement_log_entry",
        "to_type",
        sql`insert into movement_log_entry (id, equipment_unit_id, kind, user_id, to_type) values ('m', 'shields', 'move', 'sam', 'nowhere')`,
      ],
    ])("rejects an unknown %s.%s", async (table, column, write) => {
      const db = await seedShields();

      expect(await rejection(db.execute(write))).toMatch(new RegExp(`${table}_${column}_valid`));
    });
  });
});
