import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { equipmentPortion, equipmentUnit, movementLogEntry } from "./schema";
import { archiveStore } from "@/features/stores";
import { validateEquipmentUnit, type NewEquipmentUnit } from "./rules";
import {
  lowerQuantity as lowerQuantityRule,
  moveMultiple,
  movePortion,
  raiseQuantity as raiseQuantityRule,
  singlePlace,
  totalQuantity,
  wholeQuantityMove,
  type Place,
  type Portion,
} from "./portions";

export { equipmentUnit, equipmentPortion } from "./schema";
export { validateEquipmentUnit } from "./rules";
export type { NewEquipmentUnit } from "./rules";
export { describeWhereabouts, groupByWhereabouts, quickMoveFor } from "./whereabouts";
export type { EquipmentRow, QuickMove, WhereaboutsGroup, WhereaboutsNames } from "./whereabouts";
export { singlePlace, totalQuantity } from "./portions";
export type { Place, Portion } from "./portions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type EquipmentUnit = typeof equipmentUnit.$inferSelect;
export type EquipmentStatus = EquipmentUnit["status"];
export type MovementLogEntry = typeof movementLogEntry.$inferSelect;
export type MoveTarget = { type: "store"; storeId: string } | { type: "holder"; holderId: string };
export type MoveSource = Place;

/**
 * Runs `fn` in a transaction holding a row lock on the Equipment Unit, so two people changing
 * where it is (or its Quantity) at once take turns instead of overwriting each other's Portions.
 * Re-entrant: inside an outer transaction the lock is simply taken again.
 */
async function withUnitLock<T>(db: Db, equipmentUnitId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx: Db) => {
    await tx.execute(sql`select id from equipment_unit where id = ${equipmentUnitId} for update`);
    return fn(tx);
  });
}

async function loadPortions(db: Db, equipmentUnitId: string): Promise<Portion[]> {
  return db.select().from(equipmentPortion).where(eq(equipmentPortion.equipmentUnitId, equipmentUnitId));
}

/** Replaces every Portion of an Equipment Unit with the given set. */
async function savePortions(db: Db, equipmentUnitId: string, portions: Portion[]) {
  await db.delete(equipmentPortion).where(eq(equipmentPortion.equipmentUnitId, equipmentUnitId));
  if (portions.length === 0) return;
  await db.insert(equipmentPortion).values(
    portions.map((p) => ({
      id: crypto.randomUUID(),
      equipmentUnitId,
      count: p.count,
      whereaboutsType: p.whereaboutsType,
      storeId: p.storeId,
      holderId: p.holderId,
      lastSeenEventId: p.lastSeenEventId,
    })),
  );
}

export async function listEquipmentUnits(
  db: Db,
  { includeRetired = false }: { includeRetired?: boolean } = {},
): Promise<EquipmentUnit[]> {
  if (includeRetired) return db.select().from(equipmentUnit);
  return db.select().from(equipmentUnit).where(ne(equipmentUnit.status, "retired"));
}

export async function createEquipmentUnit(
  db: Db,
  input: NewEquipmentUnit,
): Promise<{ ok: true; equipmentUnit: EquipmentUnit } | { ok: false; error: string }> {
  const result = validateEquipmentUnit(input);
  if (!result.ok) return result;

  const quantity = input.quantity ?? 1;
  const row: EquipmentUnit = await db.transaction(async (tx: Db) => {
    const [created] = await tx
      .insert(equipmentUnit)
      .values({
        id: crypto.randomUUID(),
        name: input.name,
        homeId: input.homeId,
        quantity,
      })
      .returning();
    await tx.insert(equipmentPortion).values({
      id: crypto.randomUUID(),
      equipmentUnitId: created.id,
      count: quantity,
      whereaboutsType: "store",
      storeId: input.homeId,
    });
    return created;
  });
  return { ok: true, equipmentUnit: row };
}

export async function setEquipmentStatus(db: Db, id: string, status: EquipmentStatus) {
  await db.update(equipmentUnit).set({ status }).where(eq(equipmentUnit.id, id));
}

/**
 * Takes an Equipment Unit out of circulation (Retired), e.g. one added by mistake. Equipment Units
 * are never deleted: its Portions, Movement Log and Duties stay, so history still reads.
 */
export async function retireEquipmentUnit(db: Db, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const retired: { id: string }[] = await db
    .update(equipmentUnit)
    .set({ status: "retired" })
    .where(eq(equipmentUnit.id, id))
    .returning({ id: equipmentUnit.id });
  if (retired.length === 0) return { ok: false, error: "That equipment no longer exists." };
  return { ok: true };
}

/**
 * Archives a Store unless it is still in use: some in-circulation Equipment Unit has it as its Home
 * or has a Portion there. (It lives here because Equipment already depends on Stores, not the reverse.)
 */
export async function archiveStoreIfUnused(db: Db, storeId: string): Promise<{ ok: true } | { ok: false; error: "store-is-home" | "store-not-empty" }> {
  const [homed] = await db
    .select({ id: equipmentUnit.id })
    .from(equipmentUnit)
    .where(and(eq(equipmentUnit.homeId, storeId), ne(equipmentUnit.status, "retired")))
    .limit(1);
  if (homed) return { ok: false, error: "store-is-home" };
  const [holding] = await db
    .select({ id: equipmentPortion.id })
    .from(equipmentPortion)
    .innerJoin(equipmentUnit, eq(equipmentUnit.id, equipmentPortion.equipmentUnitId))
    .where(and(eq(equipmentPortion.storeId, storeId), ne(equipmentUnit.status, "retired")))
    .limit(1);
  if (holding) return { ok: false, error: "store-not-empty" };
  await archiveStore(db, storeId);
  return { ok: true };
}

export async function setConditionNote(
  db: Db,
  id: string,
  userId: string,
  conditionNote: string,
) {
  await db.update(equipmentUnit).set({ conditionNote }).where(eq(equipmentUnit.id, id));
  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    equipmentUnitId: id,
    kind: "condition_note",
    userId,
    conditionNote,
  });
}

function logTarget(target: MoveTarget) {
  return {
    toType: target.type,
    toStoreId: target.type === "store" ? target.storeId : null,
    toHolderId: target.type === "holder" ? target.holderId : null,
  };
}

function logSource(from: Place) {
  return {
    fromType: from.type,
    fromStoreId: from.type === "store" ? from.storeId : null,
    fromHolderId: from.type === "holder" ? from.holderId : null,
  };
}

/**
 * Records a Move. With no `count`/`from`, the whole Quantity moves (every Portion
 * consolidates into one, at the target) — how Duties confirm today. With `from`
 * (and optionally a `count`, defaulting to everything there), only that Portion moves —
 * an ad-hoc Move on a counted Equipment Unit that is split across places.
 */
export async function recordMove(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  target: MoveTarget,
  reason: "ad_hoc" | "duty" = "ad_hoc",
  options?: { count?: number; from?: Place },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (options?.count !== undefined && (!Number.isInteger(options.count) || options.count < 1)) {
    return { ok: false, error: "Enter how many to move." };
  }
  return withUnitLock(db, equipmentUnitId, (tx) => recordMoveLocked(tx, equipmentUnitId, userId, target, reason, options));
}

async function recordMoveLocked(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  target: MoveTarget,
  reason: "ad_hoc" | "duty",
  options?: { count?: number; from?: Place },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const portions = await loadPortions(db, equipmentUnitId);

  let nextPortions: Portion[];
  let movedCount: number;
  let from: Place;

  if (options?.from) {
    from = options.from;
    movedCount = options.count ?? portionCountAt(portions, from);
    const moved = movePortion(portions, { count: movedCount, from, to: target });
    if (!moved.ok) return moved;
    nextPortions = moved.portions;
  } else {
    from = singlePlace(portions) ?? { type: "store", storeId: "" };
    movedCount = totalQuantity(portions);
    nextPortions = wholeQuantityMove(portions, target);
  }

  await savePortions(db, equipmentUnitId, nextPortions);

  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    equipmentUnitId,
    kind: "move",
    userId,
    reason,
    count: movedCount,
    ...logSource(from),
    ...logTarget(target),
  });
  return { ok: true };
}

function samePlace(a: Place, b: MoveTarget): boolean {
  if (a.type === "store" && b.type === "store") return a.storeId === b.storeId;
  if (a.type === "holder" && b.type === "holder") return a.holderId === b.holderId;
  return false;
}

/** Pairs sources with targets into loggable flows (the pairing is arbitrary — see `moveMultiple`). */
function pairFlows(
  sources: { from: Place; count: number }[],
  targets: { to: MoveTarget; count: number }[],
): { from: Place; to: MoveTarget; count: number }[] {
  const flows: { from: Place; to: MoveTarget; count: number }[] = [];
  let si = 0;
  let ti = 0;
  let sRemain = sources[0]?.count ?? 0;
  let tRemain = targets[0]?.count ?? 0;
  while (si < sources.length && ti < targets.length) {
    const take = Math.min(sRemain, tRemain);
    if (take > 0) flows.push({ from: sources[si].from, to: targets[ti].to, count: take });
    sRemain -= take;
    tRemain -= take;
    if (sRemain === 0) sRemain = sources[++si]?.count ?? 0;
    if (tRemain === 0) tRemain = targets[++ti]?.count ?? 0;
  }
  return flows;
}

/**
 * Records a Move gathered from several source Places and/or split across several
 * target Places (Shared Duties: several People bringing or holding an Equipment Unit).
 * Logs one Movement Log entry per source/target flow (skipping any that are a no-op —
 * the same Place on both ends).
 */
export async function recordSplitMove(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  reason: "ad_hoc" | "duty",
  moves: { sources: { from: Place; count: number }[]; targets: { to: MoveTarget; count: number }[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withUnitLock(db, equipmentUnitId, (tx) => recordSplitMoveLocked(tx, equipmentUnitId, userId, reason, moves));
}

async function recordSplitMoveLocked(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  reason: "ad_hoc" | "duty",
  { sources, targets }: { sources: { from: Place; count: number }[]; targets: { to: MoveTarget; count: number }[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const portions = await loadPortions(db, equipmentUnitId);
  const moved = moveMultiple(portions, { sources, targets });
  if (!moved.ok) return moved;
  await savePortions(db, equipmentUnitId, moved.portions);

  const flows = pairFlows(sources, targets).filter((f) => !samePlace(f.from, f.to));
  for (const f of flows) {
    await db.insert(movementLogEntry).values({
      id: crypto.randomUUID(),
      equipmentUnitId,
      kind: "move",
      userId,
      reason,
      count: f.count,
      ...logSource(f.from),
      ...logTarget(f.to),
    });
  }
  return { ok: true };
}

function portionCountAt(portions: Portion[], place: Place): number {
  return (
    portions.find((p) => {
      if (place.type === "store") return p.whereaboutsType === "store" && p.storeId === place.storeId;
      if (place.type === "holder") return p.whereaboutsType === "holder" && p.holderId === place.holderId;
      return p.whereaboutsType === "unconfirmed" && p.lastSeenEventId === place.lastSeenEventId;
    })?.count ?? 0
  );
}

/**
 * The Equipment Unit's Whereabouts is unknown: the count at the given source Place (or the
 * whole Quantity, with no `from`) was last seen at the given Event. No Move is recorded.
 */
export async function setUnconfirmed(db: Db, equipmentUnitId: string, lastSeenEventId: string, from?: Place, count?: number) {
  return withUnitLock(db, equipmentUnitId, (tx) => setUnconfirmedLocked(tx, equipmentUnitId, lastSeenEventId, from, count));
}

async function setUnconfirmedLocked(db: Db, equipmentUnitId: string, lastSeenEventId: string, from?: Place, count?: number) {
  const portions = await loadPortions(db, equipmentUnitId);
  const target: Place = { type: "unconfirmed", lastSeenEventId };
  let nextPortions: Portion[];
  if (from) {
    const available = portionCountAt(portions, from);
    const moveCount = count !== undefined ? Math.min(count, available) : available;
    if (moveCount < 1) return;
    const moved = movePortion(portions, { count: moveCount, from, to: target });
    nextPortions = moved.ok ? moved.portions : portions;
  } else {
    nextPortions = wholeQuantityMove(portions, target);
  }
  await savePortions(db, equipmentUnitId, nextPortions);
}

export async function getEquipmentUnit(db: Db, id: string): Promise<EquipmentUnit | undefined> {
  const [row] = await db.select().from(equipmentUnit).where(eq(equipmentUnit.id, id));
  return row;
}

/** Several Equipment Units by id in one query, e.g. to look up their Quantities together. */
export async function listEquipmentUnitsByIds(db: Db, ids: string[]): Promise<EquipmentUnit[]> {
  if (ids.length === 0) return [];
  return db.select().from(equipmentUnit).where(inArray(equipmentUnit.id, ids));
}

/** An Equipment Unit's Portions: where it is right now, split by count. */
export async function getPortions(db: Db, equipmentUnitId: string): Promise<Portion[]> {
  return loadPortions(db, equipmentUnitId);
}

/** Every Portion of the given Equipment Units, for building the Equipment view in one query. */
export async function listPortionsFor(db: Db, equipmentUnitIds: string[]): Promise<Portion[]> {
  if (equipmentUnitIds.length === 0) return [];
  return db.select().from(equipmentPortion).where(inArray(equipmentPortion.equipmentUnitId, equipmentUnitIds));
}

/** Raises an Equipment Unit's Quantity; the extra count starts at Home. Logged in the Movement Log. */
export async function raiseQuantity(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  addCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(addCount) || addCount < 1) return { ok: false, error: "Enter how many were bought." };
  return withUnitLock(db, equipmentUnitId, (tx) => raiseQuantityLocked(tx, equipmentUnitId, userId, addCount));
}

async function raiseQuantityLocked(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  addCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [unit, portions] = await Promise.all([getEquipmentUnit(db, equipmentUnitId), loadPortions(db, equipmentUnitId)]);
  if (!unit) return { ok: false, error: "That equipment no longer exists." };

  const nextPortions = raiseQuantityRule(portions, { storeId: unit.homeId, addCount });
  await db.update(equipmentUnit).set({ quantity: unit.quantity + addCount }).where(eq(equipmentUnit.id, equipmentUnitId));
  await savePortions(db, equipmentUnitId, nextPortions);
  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    equipmentUnitId,
    kind: "move",
    userId,
    reason: "ad_hoc",
    count: addCount,
    toType: "store",
    toStoreId: unit.homeId,
    conditionNote: `Bought ${addCount}`,
  });
  return { ok: true };
}

/** Lowers an Equipment Unit's Quantity; Committee picks the Place when split. Logged in the Movement Log. */
export async function lowerQuantity(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  removeCount: number,
  from?: Place,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(removeCount) || removeCount < 1) return { ok: false, error: "Enter how many were lost." };
  return withUnitLock(db, equipmentUnitId, (tx) => lowerQuantityLocked(tx, equipmentUnitId, userId, removeCount, from));
}

async function lowerQuantityLocked(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  removeCount: number,
  from?: Place,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [unit, portions] = await Promise.all([getEquipmentUnit(db, equipmentUnitId), loadPortions(db, equipmentUnitId)]);
  if (!unit) return { ok: false, error: "That equipment no longer exists." };

  const result = lowerQuantityRule(portions, { removeCount, from });
  if (!result.ok) return result;

  await db.update(equipmentUnit).set({ quantity: unit.quantity - removeCount }).where(eq(equipmentUnit.id, equipmentUnitId));
  await savePortions(db, equipmentUnitId, result.portions);
  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    equipmentUnitId,
    kind: "move",
    userId,
    reason: "ad_hoc",
    count: removeCount,
    ...(from ? logSource(from) : {}),
    conditionNote: `Lost ${removeCount}`,
  });
  return { ok: true };
}

/**
 * Sets an Equipment Unit's Quantity to a new total: raising logs it as bought, lowering as lost
 * (Committee picks the Place when split). An unchanged Quantity does nothing.
 */
export async function setQuantity(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  quantity: number,
  from?: Place,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(quantity)) return { ok: false, error: "Enter how many there are now." };
  if (quantity < 1) return { ok: false, error: "Can't lower an equipment unit's quantity below 1." };
  return withUnitLock(db, equipmentUnitId, (tx) => setQuantityLocked(tx, equipmentUnitId, userId, quantity, from));
}

async function setQuantityLocked(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  quantity: number,
  from?: Place,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unit = await getEquipmentUnit(db, equipmentUnitId);
  if (!unit) return { ok: false, error: "That equipment no longer exists." };

  if (quantity > unit.quantity) return raiseQuantity(db, equipmentUnitId, userId, quantity - unit.quantity);
  if (quantity < unit.quantity) return lowerQuantity(db, equipmentUnitId, userId, unit.quantity - quantity, from);
  return { ok: true };
}

export async function listMovementLog(db: Db, equipmentUnitId: string): Promise<MovementLogEntry[]> {
  return db
    .select()
    .from(movementLogEntry)
    .where(eq(movementLogEntry.equipmentUnitId, equipmentUnitId))
    .orderBy(desc(movementLogEntry.createdAt));
}

/** Equipment Units currently with this User as Holder (Retired ones are out of circulation), with the count held. */
export async function listEquipmentHeldBy(db: Db, userId: string): Promise<(EquipmentUnit & { count: number })[]> {
  const held: (Portion & { equipmentUnitId: string })[] = await db
    .select()
    .from(equipmentPortion)
    .where(and(eq(equipmentPortion.whereaboutsType, "holder"), eq(equipmentPortion.holderId, userId)));
  if (held.length === 0) return [];
  const units: EquipmentUnit[] = await db
    .select()
    .from(equipmentUnit)
    .where(and(inArray(equipmentUnit.id, held.map((p) => p.equipmentUnitId)), ne(equipmentUnit.status, "retired")));
  const countByUnit = new Map(held.map((p) => [p.equipmentUnitId, p.count]));
  return units.map((u) => ({ ...u, count: countByUnit.get(u.id) ?? 0 }));
}

/** Whether anyone has recorded a Move of this Equipment Unit after the given moment. */
export async function hasMoveSince(db: Db, equipmentUnitId: string, since: Date): Promise<boolean> {
  const rows: { id: string }[] = await db
    .select({ id: movementLogEntry.id })
    .from(movementLogEntry)
    .where(
      and(
        eq(movementLogEntry.equipmentUnitId, equipmentUnitId),
        eq(movementLogEntry.kind, "move"),
        gt(movementLogEntry.createdAt, since),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
