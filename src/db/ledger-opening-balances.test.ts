import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getPortions, listEquipmentUnits, movementLogEntry, replayWhereabouts, sameWhereabouts, setUnconfirmed } from "@/features/equipment";
import { createTestDb } from "@/test/db";
import { seedSeason } from "@/test/season";

/** The data step of migration 0037: everything after its last statement breakpoint. */
function openingBalanceStatement(): string {
  const file = readFileSync(path.join(process.cwd(), "drizzle", "0037_ledger-opening-balances.sql"), "utf8");
  return file.split("--> statement-breakpoint").at(-1)!;
}

async function replaysEveryUnit(db: Awaited<ReturnType<typeof createTestDb>>) {
  const mismatched: string[] = [];
  for (const unit of await listEquipmentUnits(db)) {
    const replayed = await replayWhereabouts(db, unit.id);
    if (!replayed.ok || !sameWhereabouts(replayed.portions, await getPortions(db, unit.id))) mismatched.push(unit.name);
  }
  return mismatched;
}

describe("migration 0037: opening balances for units from before the ledger", () => {
  it("makes every Equipment Unit replay to its Portions, however its log was left", async () => {
    const db = await createTestDb();
    const { unitId, nextEventId } = await seedSeason(db);
    const units = await listEquipmentUnits(db);

    // Leave the log the way units created before L4 had it.
    await db.execute(sql`delete from movement_log_entry where equipment_unit_id = ${units[0].id}`); // no log at all
    await db.execute(sql`delete from movement_log_entry where kind = 'added' and equipment_unit_id = ${units[1].id}`); // no "added"
    await setUnconfirmed(db, unitId, nextEventId); // then forget that it was logged
    await db.execute(sql`delete from movement_log_entry where kind = 'unconfirmed'`);
    expect(await replaysEveryUnit(db)).not.toEqual([]);

    await db.execute(sql.raw(openingBalanceStatement()));

    expect(await replaysEveryUnit(db)).toEqual([]);
    const opening = await db.select().from(movementLogEntry).where(eq(movementLogEntry.kind, "opening"));
    expect(opening.length).toBeGreaterThan(0);
    expect(opening.every((entry) => entry.userId === null)).toBe(true);
  });

  it("keeps replaying correctly as the unit changes afterwards", async () => {
    const db = await createTestDb();
    const { unitId, nextEventId } = await seedSeason(db);
    await db.execute(sql`delete from movement_log_entry where equipment_unit_id = ${unitId}`);
    await db.execute(sql.raw(openingBalanceStatement()));

    await setUnconfirmed(db, unitId, nextEventId);

    expect(await replaysEveryUnit(db)).toEqual([]);
  });
});
