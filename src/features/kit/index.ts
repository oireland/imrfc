import { and, desc, eq, ne } from "drizzle-orm";
import { kitUnit, movementLogEntry } from "./schema";
import { validateKitUnit, type NewKitUnit } from "./rules";

export { kitUnit } from "./schema";
export { validateKitUnit } from "./rules";
export type { NewKitUnit } from "./rules";
export { groupByWhereabouts, quickMoveFor } from "./whereabouts";
export type { QuickMove, WhereaboutsGroup } from "./whereabouts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type KitUnit = typeof kitUnit.$inferSelect;
export type KitStatus = KitUnit["status"];
export type MovementLogEntry = typeof movementLogEntry.$inferSelect;
export type MoveTarget = { type: "store"; storeId: string } | { type: "holder"; holderId: string };

export async function listKitUnits(
  db: Db,
  { includeRetired = false }: { includeRetired?: boolean } = {},
): Promise<KitUnit[]> {
  if (includeRetired) return db.select().from(kitUnit);
  return db.select().from(kitUnit).where(ne(kitUnit.status, "retired"));
}

export async function createKitUnit(
  db: Db,
  input: NewKitUnit,
): Promise<{ ok: true; kitUnit: KitUnit } | { ok: false; error: string }> {
  const result = validateKitUnit(input);
  if (!result.ok) return result;

  const [row] = await db
    .insert(kitUnit)
    .values({
      id: crypto.randomUUID(),
      ...input,
      whereaboutsType: "store",
      storeId: input.homeId,
    })
    .returning();
  return { ok: true, kitUnit: row };
}

export async function setKitStatus(db: Db, id: string, status: KitStatus) {
  await db.update(kitUnit).set({ status }).where(eq(kitUnit.id, id));
}

export async function setConditionNote(
  db: Db,
  id: string,
  userId: string,
  conditionNote: string,
) {
  await db.update(kitUnit).set({ conditionNote }).where(eq(kitUnit.id, id));
  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    kitUnitId: id,
    kind: "condition_note",
    userId,
    conditionNote,
  });
}

/** Records an ad-hoc Move: "I've got it" (Holder) or "put it in [Store]". */
export async function recordMove(
  db: Db,
  kitUnitId: string,
  userId: string,
  target: MoveTarget,
  reason: "ad_hoc" | "duty" = "ad_hoc",
) {
  await db
    .update(kitUnit)
    .set(
      target.type === "store"
        ? { whereaboutsType: "store", storeId: target.storeId, holderId: null, lastSeenEventId: null }
        : { whereaboutsType: "holder", holderId: target.holderId, storeId: null, lastSeenEventId: null },
    )
    .where(eq(kitUnit.id, kitUnitId));

  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    kitUnitId,
    kind: "move",
    userId,
    reason,
    toType: target.type,
    toStoreId: target.type === "store" ? target.storeId : null,
    toHolderId: target.type === "holder" ? target.holderId : null,
  });
}

/** The Kit Unit's Whereabouts is unknown: it was last seen at the given Event. No Move is recorded. */
export async function setUnconfirmed(db: Db, kitUnitId: string, lastSeenEventId: string) {
  await db
    .update(kitUnit)
    .set({ whereaboutsType: "unconfirmed", storeId: null, holderId: null, lastSeenEventId })
    .where(eq(kitUnit.id, kitUnitId));
}

export async function getKitUnit(db: Db, id: string): Promise<KitUnit | undefined> {
  const [row] = await db.select().from(kitUnit).where(eq(kitUnit.id, id));
  return row;
}

export async function listMovementLog(db: Db, kitUnitId: string): Promise<MovementLogEntry[]> {
  return db
    .select()
    .from(movementLogEntry)
    .where(eq(movementLogEntry.kitUnitId, kitUnitId))
    .orderBy(desc(movementLogEntry.createdAt));
}

/** Kit Units currently with this User as Holder (Retired ones are out of circulation). */
export async function listKitHeldBy(db: Db, userId: string): Promise<KitUnit[]> {
  return db
    .select()
    .from(kitUnit)
    .where(and(eq(kitUnit.whereaboutsType, "holder"), eq(kitUnit.holderId, userId), ne(kitUnit.status, "retired")));
}
