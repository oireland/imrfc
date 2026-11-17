import type { Db } from "@/db/types";
import { LIMITS, firstTooLong } from "@/lib/text-limits";
import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { equipmentPortion, equipmentUnit, movementLogEntry } from "./schema";
import { archiveStore } from "@/features/stores";
import { validateEquipmentUnit, type NewEquipmentUnit } from "./rules";
import {
  countAt,
  lowerQuantity as lowerQuantityRule,
  moveMultiple,
  singlePlace,
  placeOf,
  samePlace,
  type Place,
  type Portion,
} from "./portions";
import { applyEntry, replay, type LedgerEntry } from "./ledger";
import type { Result } from "@/lib/result";

export { equipmentUnit, equipmentPortion, movementLogEntry } from "./schema";
export { validateEquipmentUnit } from "./rules";
export type { NewEquipmentUnit } from "./rules";
export { describeWhereabouts, groupByWhereabouts, historyLine, quickMoveFor } from "./whereabouts";
export type { EquipmentRow, HistoryNames, QuickMove, WhereaboutsGroup, WhereaboutsNames } from "./whereabouts";
export { parsePlaceKey, placeKey, placeOf, singlePlace, totalQuantity } from "./portions";
export type { Place, Portion } from "./portions";
export { sameWhereabouts } from "./ledger";
export type { LedgerEntry } from "./ledger";


export type EquipmentUnit = typeof equipmentUnit.$inferSelect;
export type EquipmentStatus = EquipmentUnit["status"];
export type MovementLogEntry = typeof movementLogEntry.$inferSelect;
export type MoveTarget = { type: "store"; storeId: string } | { type: "holder"; holderId: string };
export type MoveSource = Place;

/**
 * Runs `fn` in a transaction holding a row lock on the Equipment Unit, so two people changing
 * where it is (or its Quantity) at once take turns instead of overwriting each other's Portions.
 * Anything that decides a change from the current Portions (e.g. Confirm picking its sources)
 * should read them inside `fn`, or it may act on Portions that have since changed.
 * Re-entrant: inside an outer transaction the lock is simply taken again.
 *
 * `no key update`, not `update`: the id never changes, so rows elsewhere that reference the
 * Equipment Unit (a new Duty, say) can still be written while it's locked.
 */
export async function withUnitLock<T>(db: Db, equipmentUnitId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from equipment_unit where id = ${equipmentUnitId} for no key update`);
    return fn(tx);
  });
}

/** An Equipment Unit's Portions: where it is right now, split by count. */
export async function loadPortions(db: Db, equipmentUnitId: string): Promise<Portion[]> {
  return db.select().from(equipmentPortion).where(eq(equipmentPortion.equipmentUnitId, equipmentUnitId));
}

/** Replaces every Portion of an Equipment Unit with the given set. Only `appendToLedger` calls this. */
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

type PlaceColumns<P extends "from" | "to"> = { [K in `${P}Type`]: Place["type"] | null } & {
  [K in `${P}StoreId` | `${P}HolderId` | `${P}LastSeenEventId`]: string | null;
};

function placeColumns<P extends "from" | "to">(prefix: P, place: Place | undefined): PlaceColumns<P> {
  return {
    [`${prefix}Type`]: place?.type ?? null,
    [`${prefix}StoreId`]: place?.type === "store" ? place.storeId : null,
    [`${prefix}HolderId`]: place?.type === "holder" ? place.holderId : null,
    [`${prefix}LastSeenEventId`]: place?.type === "unconfirmed" ? place.lastSeenEventId : null,
  } as PlaceColumns<P>;
}

function placeFromColumns(type: string | null, storeId: string | null, holderId: string | null, lastSeenEventId: string | null): Place | undefined {
  if (type === "store" && storeId) return { type: "store", storeId };
  if (type === "holder" && holderId) return { type: "holder", holderId };
  if (type === "unconfirmed" && lastSeenEventId) return { type: "unconfirmed", lastSeenEventId };
  return undefined;
}

/** A stored entry as the ledger reads it, or why it can't be read. */
function toLedgerEntry(row: MovementLogEntry): LedgerEntry | string {
  const from = placeFromColumns(row.fromType, row.fromStoreId, row.fromHolderId, row.fromLastSeenEventId);
  const to = placeFromColumns(row.toType, row.toStoreId, row.toHolderId, row.toLastSeenEventId);
  const count = row.count ?? 0;
  switch (row.kind) {
    case "condition_note":
      return { kind: "condition_note" };
    case "added":
    case "opening":
    case "bought":
      return to ? { kind: row.kind, count, to } : `${row.kind} entry ${row.id} doesn't say where to`;
    case "lost":
      return from ? { kind: "lost", count, from } : `lost entry ${row.id} doesn't say where from`;
    case "move":
    case "unconfirmed":
      return from && to ? { kind: row.kind, count, from, to } : `${row.kind} entry ${row.id} doesn't say where from and to`;
  }
}

/**
 * Appends entries to an Equipment Unit's Movement Log and brings its Portions up to date to match,
 * all in the caller's transaction (which must hold the unit lock, or be creating the unit). This is
 * the only way the Whereabouts changes: the Portions are always what replaying the log gives.
 */
async function appendToLedger(
  db: Db,
  equipmentUnitId: string,
  userId: string | null,
  entries: LedgerEntry[],
  reason?: "ad_hoc" | "duty",
): Promise<Result> {
  if (entries.length === 0) return { ok: true };
  let portions = await loadPortions(db, equipmentUnitId);
  for (const entry of entries) {
    const applied = applyEntry(portions, entry, equipmentUnitId);
    if (!applied.ok) return applied;
    portions = applied.portions;
  }
  // One statement, so `seq` follows the order of `entries`.
  await db.insert(movementLogEntry).values(
    entries.map((entry) => ({
      id: crypto.randomUUID(),
      equipmentUnitId,
      kind: entry.kind,
      userId,
      reason: entry.kind === "move" ? (reason ?? "ad_hoc") : null,
      count: entry.kind === "condition_note" ? null : entry.count,
      ...placeColumns("from", "from" in entry ? entry.from : undefined),
      ...placeColumns("to", "to" in entry ? entry.to : undefined),
    })),
  );
  await savePortions(db, equipmentUnitId, portions);
  return { ok: true };
}

/** An Equipment Unit's Portions rebuilt from nothing but its Movement Log. */
export async function replayWhereabouts(db: Db, equipmentUnitId: string): Promise<Result<{ portions: Portion[] }>> {
  const rows = await db
    .select()
    .from(movementLogEntry)
    .where(eq(movementLogEntry.equipmentUnitId, equipmentUnitId))
    .orderBy(asc(movementLogEntry.seq));
  const entries: LedgerEntry[] = [];
  for (const row of rows) {
    const entry = toLedgerEntry(row);
    if (typeof entry === "string") return { ok: false, error: entry };
    entries.push(entry);
  }
  return replay(equipmentUnitId, entries);
}

export async function listEquipmentUnits(
  db: Db,
  { includeRetired = false }: { includeRetired?: boolean } = {},
): Promise<EquipmentUnit[]> {
  if (includeRetired) return db.select().from(equipmentUnit);
  return db.select().from(equipmentUnit).where(ne(equipmentUnit.status, "retired"));
}

/** Adds an Equipment Unit with its whole Quantity at Home, logged as added by `input.addedBy`. */
export async function createEquipmentUnit(
  db: Db,
  input: NewEquipmentUnit,
): Promise<Result<{ equipmentUnit: EquipmentUnit }>> {
  const result = validateEquipmentUnit(input);
  if (!result.ok) return result;

  const quantity = input.quantity ?? 1;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(equipmentUnit)
      .values({
        id: crypto.randomUUID(),
        name: input.name,
        homeId: input.homeId,
        quantity,
      })
      .returning();
    await appendToLedger(tx, created.id, input.addedBy ?? null, [
      { kind: "added", count: quantity, to: { type: "store", storeId: input.homeId } },
    ]);
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
export async function retireEquipmentUnit(db: Db, id: string): Promise<Result> {
  const retired = await db
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
): Promise<Result> {
  const tooLong = firstTooLong([["note", conditionNote, LIMITS.note]]);
  if (tooLong) return { ok: false, error: tooLong };
  await db.update(equipmentUnit).set({ conditionNote }).where(eq(equipmentUnit.id, id));
  await db.insert(movementLogEntry).values({
    id: crypto.randomUUID(),
    equipmentUnitId: id,
    kind: "condition_note",
    userId,
    conditionNote,
  });
  return { ok: true };
}

/**
 * Records a Move. With no `count`/`from`, the whole Quantity moves (every Portion
 * consolidates into one, at the target, with an entry for each Place it left). With `from`
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
): Promise<Result> {
  if (options?.count !== undefined && (!Number.isInteger(options.count) || options.count < 1)) {
    return { ok: false, error: "Enter how many to move." };
  }
  return withUnitLock(db, equipmentUnitId, async (tx) => {
    const portions = await loadPortions(tx, equipmentUnitId);
    if (options?.from) {
      const count = options.count ?? countAt(portions, options.from);
      return appendToLedger(tx, equipmentUnitId, userId, [{ kind: "move", count, from: options.from, to: target }], reason);
    }
    // Every Place it's at, the target included, so "I've got it" still logs a Move when it's already there.
    const entries: LedgerEntry[] = portions.map((p) => ({ kind: "move", count: p.count, from: placeOf(p), to: target }));
    return appendToLedger(tx, equipmentUnitId, userId, entries, reason);
  });
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
): Promise<Result> {
  const { sources, targets } = moves;
  return withUnitLock(db, equipmentUnitId, async (tx) => {
    // Checks the whole Move adds up and each source has enough, with the messages people see.
    const checked = moveMultiple(await loadPortions(tx, equipmentUnitId), { sources, targets });
    if (!checked.ok) return checked;
    const flows = pairFlows(sources, targets).filter((f) => !samePlace(f.from, f.to));
    return appendToLedger(
      tx,
      equipmentUnitId,
      userId,
      flows.map((f) => ({ kind: "move", count: f.count, from: f.from, to: f.to })),
      reason,
    );
  });
}

/**
 * The Equipment Unit's Whereabouts is unknown: the count at the given source Place (or the
 * whole Quantity, with no `from`) was last seen at the given Event. Logged with no User, and not as
 * a Move: nobody did this.
 */
export async function setUnconfirmed(db: Db, equipmentUnitId: string, lastSeenEventId: string, from?: Place, count?: number) {
  return withUnitLock(db, equipmentUnitId, async (tx) => {
    const portions = await loadPortions(tx, equipmentUnitId);
    const to: Place = { type: "unconfirmed", lastSeenEventId };
    let entries: LedgerEntry[];
    if (from) {
      const available = countAt(portions, from);
      const moveCount = count !== undefined ? Math.min(count, available) : available;
      if (moveCount < 1) return;
      entries = [{ kind: "unconfirmed", count: moveCount, from, to }];
    } else {
      entries = portions
        .filter((p) => p.lastSeenEventId !== lastSeenEventId)
        .map((p) => ({ kind: "unconfirmed", count: p.count, from: placeOf(p), to }));
    }
    await appendToLedger(tx, equipmentUnitId, null, entries);
  });
}

/** Whether any equipment is Unconfirmed, last seen at this Event. */
export async function hasEquipmentUnconfirmedAt(db: Db, eventId: string): Promise<boolean> {
  const rows = await db.select({ id: equipmentPortion.id }).from(equipmentPortion).where(eq(equipmentPortion.lastSeenEventId, eventId)).limit(1);
  return rows.length > 0;
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
): Promise<Result> {
  if (!Number.isInteger(addCount) || addCount < 1) return { ok: false, error: "Enter how many were bought." };
  return withUnitLock(db, equipmentUnitId, (tx) => buy(tx, equipmentUnitId, userId, addCount));
}

/** Lowers an Equipment Unit's Quantity; Committee picks the Place when split. Logged in the Movement Log. */
export async function lowerQuantity(
  db: Db,
  equipmentUnitId: string,
  userId: string,
  removeCount: number,
  from?: Place,
): Promise<Result> {
  if (!Number.isInteger(removeCount) || removeCount < 1) return { ok: false, error: "Enter how many were lost." };
  return withUnitLock(db, equipmentUnitId, (tx) => lose(tx, equipmentUnitId, userId, removeCount, from));
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
): Promise<Result> {
  if (!Number.isInteger(quantity)) return { ok: false, error: "Enter how many there are now." };
  if (quantity < 1) return { ok: false, error: "Can't lower an equipment unit's quantity below 1." };
  return withUnitLock(db, equipmentUnitId, async (tx) => {
    const unit = await getEquipmentUnit(tx, equipmentUnitId);
    if (!unit) return { ok: false, error: "That equipment no longer exists." };
    if (quantity > unit.quantity) return buy(tx, equipmentUnitId, userId, quantity - unit.quantity);
    if (quantity < unit.quantity) return lose(tx, equipmentUnitId, userId, unit.quantity - quantity, from);
    return { ok: true };
  });
}

// `buy` and `lose` expect to run inside `withUnitLock`: `tx` is the locked transaction.
async function buy(
  tx: Db,
  equipmentUnitId: string,
  userId: string,
  addCount: number,
): Promise<Result> {
  const unit = await getEquipmentUnit(tx, equipmentUnitId);
  if (!unit) return { ok: false, error: "That equipment no longer exists." };

  await tx.update(equipmentUnit).set({ quantity: unit.quantity + addCount }).where(eq(equipmentUnit.id, equipmentUnitId));
  return appendToLedger(tx, equipmentUnitId, userId, [{ kind: "bought", count: addCount, to: { type: "store", storeId: unit.homeId } }]);
}

async function lose(
  tx: Db,
  equipmentUnitId: string,
  userId: string,
  removeCount: number,
  from?: Place,
): Promise<Result> {
  const [unit, portions] = await Promise.all([getEquipmentUnit(tx, equipmentUnitId), loadPortions(tx, equipmentUnitId)]);
  if (!unit) return { ok: false, error: "That equipment no longer exists." };

  const result = lowerQuantityRule(portions, { removeCount, from });
  if (!result.ok) return result;
  // The rule only succeeds with a `from` or a unit at a single Place.
  const place = (from ?? singlePlace(portions))!;

  await tx.update(equipmentUnit).set({ quantity: unit.quantity - removeCount }).where(eq(equipmentUnit.id, equipmentUnitId));
  return appendToLedger(tx, equipmentUnitId, userId, [{ kind: "lost", count: removeCount, from: place }]);
}

export async function listMovementLog(db: Db, equipmentUnitId: string): Promise<MovementLogEntry[]> {
  return db
    .select()
    .from(movementLogEntry)
    .where(eq(movementLogEntry.equipmentUnitId, equipmentUnitId))
    .orderBy(desc(movementLogEntry.seq));
}

/** Equipment Units currently with this User as Holder (Retired ones are out of circulation), with the count held. */
export async function listEquipmentHeldBy(db: Db, userId: string): Promise<(EquipmentUnit & { count: number })[]> {
  const held = await db
    .select()
    .from(equipmentPortion)
    .where(and(eq(equipmentPortion.whereaboutsType, "holder"), eq(equipmentPortion.holderId, userId)));
  if (held.length === 0) return [];
  const units = await db
    .select()
    .from(equipmentUnit)
    .where(and(inArray(equipmentUnit.id, held.map((p) => p.equipmentUnitId)), ne(equipmentUnit.status, "retired")));
  const countByUnit = new Map(held.map((p) => [p.equipmentUnitId, p.count]));
  return units.map((u) => ({ ...u, count: countByUnit.get(u.id) ?? 0 }));
}

/** Whether anyone has recorded a Move of this Equipment Unit after the given moment. */
export async function hasMoveSince(db: Db, equipmentUnitId: string, since: Date): Promise<boolean> {
  const rows = await db
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
