import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { kitPortion, kitUnit, movementLogEntry } from "./schema";
import { validateKitUnit, type NewKitUnit } from "./rules";
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

export { kitUnit, kitPortion } from "./schema";
export { validateKitUnit } from "./rules";
export type { NewKitUnit } from "./rules";
export { describeWhereabouts, groupByWhereabouts, quickMoveFor } from "./whereabouts";
export type { KitRow, QuickMove, WhereaboutsGroup, WhereaboutsNames } from "./whereabouts";
export { singlePlace, totalQuantity } from "./portions";
export type { Place, Portion } from "./portions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type KitUnit = typeof kitUnit.$inferSelect;
export type KitStatus = KitUnit["status"];
export type MovementLogEntry = typeof movementLogEntry.$inferSelect;
export type MoveTarget = { type: "store"; storeId: string } | { type: "holder"; holderId: string };
export type MoveSource = Place;

async function loadPortions(db: Db, kitUnitId: string): Promise<Portion[]> {
  return db.select().from(kitPortion).where(eq(kitPortion.kitUnitId, kitUnitId));
}

/** Replaces every Portion of a Kit Unit with the given set. */
async function savePortions(db: Db, kitUnitId: string, portions: Portion[]) {
  await db.delete(kitPortion).where(eq(kitPortion.kitUnitId, kitUnitId));
  if (portions.length === 0) return;
  await db.insert(kitPortion).values(
    portions.map((p) => ({
      id: crypto.randomUUID(),
      kitUnitId,
      count: p.count,
      whereaboutsType: p.whereaboutsType,
      storeId: p.storeId,
      holderId: p.holderId,
      lastSeenEventId: p.lastSeenEventId,
    })),
  );
}

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

  const quantity = input.quantity ?? 1;
  const [row] = await db
    .insert(kitUnit)
    .values({
      id: crypto.randomUUID(),
      name: input.name,
      homeId: input.homeId,
      quantity,
    })
    .returning();
  await db.insert(kitPortion).values({
    id: crypto.randomUUID(),
    kitUnitId: row.id,
    count: quantity,
    whereaboutsType: "store",
    storeId: input.homeId,
  });
  return { ok: true, kitUnit: row };
}

export async function setKitStatus(db: Db, id: string, status: KitStatus) {
  await db.update(kitUnit).set({ status }).where(eq(kitUnit.id, id));
}

/** Hard-deletes a Kit Unit added by mistake, along with its Portions and Movement Log. */
export async function deleteKitUnit(db: Db, id: string) {
  await db.delete(movementLogEntry).where(eq(movementLogEntry.kitUnitId, id));
  await db.delete(kitPortion).where(eq(kitPortion.kitUnitId, id));
  await db.delete(kitUnit).where(eq(kitUnit.id, id));
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
 * an ad-hoc Move on a counted Kit Unit that is split across places.
 */
export async function recordMove(
  db: Db,
  kitUnitId: string,
  userId: string,
  target: MoveTarget,
  reason: "ad_hoc" | "duty" = "ad_hoc",
  options?: { count?: number; from?: Place },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const portions = await loadPortions(db, kitUnitId);

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

  await savePortions(db, kitUnitId, nextPortions);

  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    kitUnitId,
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
 * target Places (Shared Duties: several People bringing or holding a Kit Unit).
 * Logs one Movement Log entry per source/target flow (skipping any that are a no-op —
 * the same Place on both ends).
 */
export async function recordSplitMove(
  db: Db,
  kitUnitId: string,
  userId: string,
  reason: "ad_hoc" | "duty",
  { sources, targets }: { sources: { from: Place; count: number }[]; targets: { to: MoveTarget; count: number }[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const portions = await loadPortions(db, kitUnitId);
  const moved = moveMultiple(portions, { sources, targets });
  if (!moved.ok) return moved;
  await savePortions(db, kitUnitId, moved.portions);

  const flows = pairFlows(sources, targets).filter((f) => !samePlace(f.from, f.to));
  for (const f of flows) {
    await db.insert(movementLogEntry).values({
      id: crypto.randomUUID(),
      kitUnitId,
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
 * The Kit Unit's Whereabouts is unknown: the count at the given source Place (or the
 * whole Quantity, with no `from`) was last seen at the given Event. No Move is recorded.
 */
export async function setUnconfirmed(db: Db, kitUnitId: string, lastSeenEventId: string, from?: Place, count?: number) {
  const portions = await loadPortions(db, kitUnitId);
  const target: Place = { type: "unconfirmed", lastSeenEventId };
  let nextPortions: Portion[];
  if (from) {
    const available = portionCountAt(portions, from);
    const moveCount = count !== undefined ? Math.min(count, available) : available;
    const moved = movePortion(portions, { count: moveCount, from, to: target });
    nextPortions = moved.ok ? moved.portions : portions;
  } else {
    nextPortions = wholeQuantityMove(portions, target);
  }
  await savePortions(db, kitUnitId, nextPortions);
}

export async function getKitUnit(db: Db, id: string): Promise<KitUnit | undefined> {
  const [row] = await db.select().from(kitUnit).where(eq(kitUnit.id, id));
  return row;
}

/** Several Kit Units by id in one query, e.g. to look up their Quantities together. */
export async function listKitUnitsByIds(db: Db, ids: string[]): Promise<KitUnit[]> {
  if (ids.length === 0) return [];
  return db.select().from(kitUnit).where(inArray(kitUnit.id, ids));
}

/** A Kit Unit's Portions: where it is right now, split by count. */
export async function getPortions(db: Db, kitUnitId: string): Promise<Portion[]> {
  return loadPortions(db, kitUnitId);
}

/** Every Portion of the given Kit Units, for building the Kit view in one query. */
export async function listPortionsFor(db: Db, kitUnitIds: string[]): Promise<Portion[]> {
  if (kitUnitIds.length === 0) return [];
  return db.select().from(kitPortion).where(inArray(kitPortion.kitUnitId, kitUnitIds));
}

/** Raises a Kit Unit's Quantity; the extra count starts at Home. Logged in the Movement Log. */
export async function raiseQuantity(
  db: Db,
  kitUnitId: string,
  userId: string,
  addCount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(addCount) || addCount < 1) return { ok: false, error: "Enter how many were bought." };
  const [unit, portions] = await Promise.all([getKitUnit(db, kitUnitId), loadPortions(db, kitUnitId)]);
  if (!unit) return { ok: false, error: "That kit no longer exists." };

  const nextPortions = raiseQuantityRule(portions, { storeId: unit.homeId, addCount });
  await db.update(kitUnit).set({ quantity: unit.quantity + addCount }).where(eq(kitUnit.id, kitUnitId));
  await savePortions(db, kitUnitId, nextPortions);
  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    kitUnitId,
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

/** Lowers a Kit Unit's Quantity; Committee picks the Place when split. Logged in the Movement Log. */
export async function lowerQuantity(
  db: Db,
  kitUnitId: string,
  userId: string,
  removeCount: number,
  from?: Place,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(removeCount) || removeCount < 1) return { ok: false, error: "Enter how many were lost." };
  const [unit, portions] = await Promise.all([getKitUnit(db, kitUnitId), loadPortions(db, kitUnitId)]);
  if (!unit) return { ok: false, error: "That kit no longer exists." };

  const result = lowerQuantityRule(portions, { removeCount, from });
  if (!result.ok) return result;

  await db.update(kitUnit).set({ quantity: unit.quantity - removeCount }).where(eq(kitUnit.id, kitUnitId));
  await savePortions(db, kitUnitId, result.portions);
  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    kitUnitId,
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
 * Sets a Kit Unit's Quantity to a new total: raising logs it as bought, lowering as lost
 * (Committee picks the Place when split). An unchanged Quantity does nothing.
 */
export async function setQuantity(
  db: Db,
  kitUnitId: string,
  userId: string,
  quantity: number,
  from?: Place,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(quantity)) return { ok: false, error: "Enter how many there are now." };
  if (quantity < 1) return { ok: false, error: "Can't lower a kit unit's quantity below 1." };
  const unit = await getKitUnit(db, kitUnitId);
  if (!unit) return { ok: false, error: "That kit no longer exists." };

  if (quantity > unit.quantity) return raiseQuantity(db, kitUnitId, userId, quantity - unit.quantity);
  if (quantity < unit.quantity) return lowerQuantity(db, kitUnitId, userId, unit.quantity - quantity, from);
  return { ok: true };
}

export async function listMovementLog(db: Db, kitUnitId: string): Promise<MovementLogEntry[]> {
  return db
    .select()
    .from(movementLogEntry)
    .where(eq(movementLogEntry.kitUnitId, kitUnitId))
    .orderBy(desc(movementLogEntry.createdAt));
}

/** Kit Units currently with this User as Holder (Retired ones are out of circulation), with the count held. */
export async function listKitHeldBy(db: Db, userId: string): Promise<(KitUnit & { count: number })[]> {
  const held: (Portion & { kitUnitId: string })[] = await db
    .select()
    .from(kitPortion)
    .where(and(eq(kitPortion.whereaboutsType, "holder"), eq(kitPortion.holderId, userId)));
  if (held.length === 0) return [];
  const units: KitUnit[] = await db
    .select()
    .from(kitUnit)
    .where(and(inArray(kitUnit.id, held.map((p) => p.kitUnitId)), ne(kitUnit.status, "retired")));
  const countByUnit = new Map(held.map((p) => [p.kitUnitId, p.count]));
  return units.map((u) => ({ ...u, count: countByUnit.get(u.id) ?? 0 }));
}
