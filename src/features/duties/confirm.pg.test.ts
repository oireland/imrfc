import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createPostgresTestDb, lockWaiters, waitUntil } from "@/test/postgres";
import { addToChecklist } from "@/features/checklists";
import { createEquipmentUnit, equipmentPortion, listMovementLog, recordMove } from "@/features/equipment";
import { claim, ensureDuties, leave } from "@/test/duties";
import { confirmDuty } from "./index";
import { duty, dutyUser } from "./schema";

/**
 * Runs on real Postgres (`pnpm test:pg`): PGlite has one connection, so it can't show two
 * transactions racing. To make each race happen every time, a third connection holds the
 * Equipment Unit's row while the racing calls start, and lets go once they're all waiting.
 */

/** Shields at the Shed, with Sam on Training's To Duty for `needed` of them (all, by default). */
async function setup(quantity: number, needed?: number) {
  const { db, client } = await createPostgresTestDb();
  await db.execute(sql`insert into "user" (id, name, email, email_verified, access_state) values
    ('sam', 'Sam', 'sam@example.com', true, 'approved'), ('tom', 'Tom', 'tom@example.com', true, 'approved')`);
  await db.execute(sql`insert into store (id, name, address) values ('shed', 'Shed', 'x')`);
  await db.execute(sql`insert into event (id, title, event_type, start, "end", venue) values
    ('training', 'Training', 'training', '2030-01-01T18:00:00Z', '2030-01-01T20:00:00Z', 'Pitch')`);
  const created = await createEquipmentUnit(db, { name: "Shields", homeId: "shed", quantity });
  if (!created.ok) throw new Error(created.error);
  const unitId = created.equipmentUnit.id;
  if (needed !== undefined) {
    const listed = await addToChecklist(db, { scope: "event", scopeId: "training" }, unitId, needed);
    if (!listed.ok) throw new Error(listed.error);
  }
  const duties = await ensureDuties(db, "training", [unitId]);
  const toDutyId = duties.find((d) => d.direction === "to")!.id;
  await claim(db, toDutyId, "sam");

  const whereabouts = async () =>
    (
      await db
        .select({ count: equipmentPortion.count, storeId: equipmentPortion.storeId, holderId: equipmentPortion.holderId })
        .from(equipmentPortion)
        .where(eq(equipmentPortion.equipmentUnitId, unitId))
    ).sort((a, b) => (a.storeId ?? a.holderId ?? "").localeCompare(b.storeId ?? b.holderId ?? ""));

  /** Holds the Equipment Unit's row until the returned function is called. */
  const holdUnit = async () => {
    const conn = await client.reserve();
    await conn`begin`;
    await conn`select id from equipment_unit where id = ${unitId} for update`;
    return async () => {
      await conn`rollback`;
      conn.release();
    };
  };

  return { db, client, unitId, toDutyId, whereabouts, holdUnit };
}

const sam = { id: "sam", role: "member" as const };
const shed = { type: "store" as const, storeId: "shed" };

it("Confirming the same Duty twice at once records one Move", async () => {
  const { db, client, unitId, toDutyId, whereabouts, holdUnit } = await setup(4, 2);
  const release = await holdUnit();

  // Both take 2 of the Shed's 4 (named on the confirm sheet), so a second Move would also succeed.
  const confirm = () => confirmDuty(db, toDutyId, sam, { from: [{ place: shed, count: 2 }] });
  const confirms = Promise.all([confirm(), confirm()]);
  await waitUntil(async () => (await lockWaiters(client)) === 2);
  await release();

  expect((await confirms).map((r) => r.ok).sort()).toEqual([false, true]);
  expect((await listMovementLog(db, unitId)).filter((e) => e.kind === "move")).toHaveLength(1);
  expect(await whereabouts()).toEqual([
    { count: 2, storeId: null, holderId: "sam" },
    { count: 2, storeId: "shed", holderId: null },
  ]);
});

it("a Confirm picks its sources after a Move that got there first", async () => {
  const { db, client, unitId, toDutyId, whereabouts, holdUnit } = await setup(2);
  const release = await holdUnit();

  // Tom takes one while Sam's To Duty (for both) is being Confirmed: it should take the other
  // from the Shed and Tom's from Tom, rather than both from the Shed as it looked a moment ago.
  const tomTakesOne = recordMove(db, unitId, "tom", { type: "holder", holderId: "tom" }, "ad_hoc", { count: 1, from: shed });
  await waitUntil(async () => (await lockWaiters(client)) === 1);
  const samConfirms = confirmDuty(db, toDutyId, sam);
  await waitUntil(async () => (await lockWaiters(client)) === 2);
  await release();

  expect(await tomTakesOne).toEqual({ ok: true });
  expect(await samConfirms).toEqual({ ok: true });
  expect(await whereabouts()).toEqual([{ count: 2, storeId: null, holderId: "sam" }]);
});

it("a Confirm finds nobody left on the Duty and stays open, with nothing moved", async () => {
  const { db, client, unitId, toDutyId, holdUnit } = await setup(2);
  const release = await holdUnit();

  // Sam is on it as the Confirm starts, then gone by the time it gets the Equipment Unit.
  const confirming = confirmDuty(db, toDutyId, sam);
  await waitUntil(async () => (await lockWaiters(client)) === 1);
  await db.delete(dutyUser).where(eq(dutyUser.dutyId, toDutyId));
  await release();

  expect(await confirming).toMatchObject({ ok: false });
  const [row] = await db.select({ confirmedAt: duty.confirmedAt }).from(duty).where(eq(duty.id, toDutyId));
  expect(row.confirmedAt).toBeNull();
  expect((await listMovementLog(db, unitId)).filter((e) => e.kind === "move")).toHaveLength(0);
});

it("two People claiming at once can't take more than the line needs", async () => {
  const { db, client, toDutyId, holdUnit } = await setup(4, 4);
  await leave(db, toDutyId, "sam");
  const release = await holdUnit();

  const claims = Promise.all([claim(db, toDutyId, "sam", 3), claim(db, toDutyId, "tom", 3)]);
  await waitUntil(async () => (await lockWaiters(client)) === 2);
  await release();

  expect((await claims).map((r) => r.ok).sort()).toEqual([false, true]);
  const taken = await db.select({ count: dutyUser.count }).from(dutyUser).where(eq(dutyUser.dutyId, toDutyId));
  expect(taken).toEqual([{ count: 3 }]);
});

it("adding a Duty for an Equipment Unit doesn't wait while someone is moving it", async () => {
  const { db, client, unitId } = await setup(2);
  await db.execute(sql`insert into event (id, title, event_type, start, "end", venue) values
    ('match', 'Match', 'match', '2030-01-02T14:00:00Z', '2030-01-02T17:00:00Z', 'Pitch')`);

  let finishMove!: () => void;
  const moveFinished = new Promise<void>((resolve) => (finishMove = resolve));
  let moved!: () => void;
  const moveDone = new Promise<void>((resolve) => (moved = resolve));
  const moving = db.transaction(async (tx) => {
    await recordMove(tx, unitId, "sam", { type: "holder", holderId: "sam" }, "ad_hoc", { count: 1, from: shed });
    moved();
    await moveFinished;
  });
  await moveDone;

  const other = await client.reserve();
  try {
    await other`set lock_timeout = '1s'`;
    await other`insert into duty (id, event_id, equipment_unit_id, direction) values (${crypto.randomUUID()}, 'match', ${unitId}, 'to')`;
  } finally {
    other.release();
    finishMove();
    await moving;
  }
});
