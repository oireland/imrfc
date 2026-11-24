import type { Db } from "@/db/types";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { resolveEventChecklist, resolveEventChecklists, type ResolvedEventChecklist } from "@/features/checklists";
import { event, getEvent, listEvents } from "@/features/events";
import {
  getEquipmentUnit,
  loadPortions,
  hasMoveSince,
  listEquipmentUnits,
  listEquipmentUnitsByIds,
  listPortionsFor,
  recordSplitMove,
  setUnconfirmedOnce,
  withUnitLock,
} from "@/features/equipment";
import { filterApprovedUserIds, isCommitteeOrAbove, loadNames, type Role } from "@/features/users";
import { findClashes, type Clash } from "./clashes-rules";
import { gatherConfirmSources, gatherFromDutyUsers, gatherHeldBy, validateHolderSplit, type HolderPart, type SourcePart } from "./confirm-source-rules";
import { dutyActions, type DutyAction } from "./duty-actions-rules";
import { lastDuties, seasonCount } from "./duty-record-rules";
import { findHeadsUps, type HeadsUp } from "./heads-up-rules";
import type { PlanEvent, PlanEquipment } from "./plan";
import { countToMove, holdersFromShares, pendingShares, unclaimed, validateShare, validateShares, type Share } from "./shares-rules";
import { duty, dutyUser } from "./schema";
import type { Result } from "@/lib/result";

export { duty } from "./schema";
export type { Clash } from "./clashes-rules";
export type { HeadsUp } from "./heads-up-rules";
export { othersOnDuty } from "./others-on-duty";
export { dutyActions } from "./duty-actions-rules";
export type { DutyAction } from "./duty-actions-rules";
export { seasonStart } from "./duty-record-rules";
export { gatherConfirmSources, handedOnSources, needsSourceChoice } from "./confirm-source-rules";
export type { HolderPart, SourcePart } from "./confirm-source-rules";
export { countToMove, holdersFromShares, pendingShares, unclaimed } from "./shares-rules";


export type DutyDestination = { type: "home" } | { type: "store"; storeId: string } | { type: "holder" };
export type Duty = Omit<typeof duty.$inferSelect, "destinationType" | "destinationStoreId"> & {
  destination: DutyDestination;
  /** Everyone currently on this Duty (Shared Duties: zero or more). */
  userIds: string[];
  /** How many each Person is taking; null means all of it. */
  shares: Record<string, number | null>;
  /** People who have already marked their own part done (only when everyone gave a number). */
  confirmedUserIds: string[];
};

function toDuty(row: typeof duty.$inferSelect, shares: Share[]): Duty {
  const { destinationType, destinationStoreId, ...rest } = row;
  const destination: DutyDestination =
    destinationType === "store" && destinationStoreId
      ? { type: "store", storeId: destinationStoreId }
      : destinationType === "holder"
        ? { type: "holder" }
        : { type: "home" };
  return {
    ...rest,
    destination,
    userIds: shares.map((s) => s.userId),
    shares: Object.fromEntries(shares.map((s) => [s.userId, s.count])),
    confirmedUserIds: shares.filter((s) => s.confirmed).map((s) => s.userId),
  };
}

async function getDuty(db: Db, id: string): Promise<typeof duty.$inferSelect | undefined> {
  const [row] = await db.select().from(duty).where(eq(duty.id, id));
  return row;
}

const toShare = (r: typeof dutyUser.$inferSelect): Share => ({ userId: r.userId, count: r.count, confirmed: r.confirmedAt !== null });

/** Everyone currently on a Duty, and how many each is taking. */
async function sharesOf(db: Db, dutyId: string): Promise<Share[]> {
  const rows = await db.select().from(dutyUser).where(eq(dutyUser.dutyId, dutyId));
  return rows.map(toShare);
}

/** Everyone currently on several Duties, in one query. */
async function loadSharesFor(db: Db, dutyIds: string[]): Promise<Map<string, Share[]>> {
  if (dutyIds.length === 0) return new Map();
  const rows = await db.select().from(dutyUser).where(inArray(dutyUser.dutyId, dutyIds));
  return new Map([...Map.groupBy(rows, (r) => r.dutyId)].map(([dutyId, group]) => [dutyId, group.map(toShare)]));
}

async function loadUserIdsFor(db: Db, dutyIds: string[]): Promise<Map<string, string[]>> {
  return new Map([...(await loadSharesFor(db, dutyIds))].map(([dutyId, shares]) => [dutyId, shares.map((s) => s.userId)]));
}

async function addUser(db: Db, row: typeof duty.$inferSelect, userId: string, count: number | null = null) {
  await db.insert(dutyUser).values({ id: crypto.randomUUID(), dutyId: row.id, userId, count }).onConflictDoNothing();
}

async function removeUser(db: Db, row: typeof duty.$inferSelect, userId: string) {
  await db.delete(dutyUser).where(and(eq(dutyUser.dutyId, row.id), eq(dutyUser.userId, userId)));
}

/** An Event's Duty for one Equipment Unit and direction. Creates it first if it doesn't exist yet (usually it does, so this stays read-only). */
async function ensureDuty(
  db: Db,
  eventId: string,
  equipmentUnitId: string,
  direction: "to" | "from",
): Promise<typeof duty.$inferSelect | undefined> {
  const load = async () => {
    const [row] = await db
      .select()
      .from(duty)
      .where(and(eq(duty.eventId, eventId), eq(duty.equipmentUnitId, equipmentUnitId), eq(duty.direction, direction)));
    return row;
  };
  const existing = await load();
  if (existing) return existing;
  await db
    .insert(duty)
    .values({ id: crypto.randomUUID(), eventId, equipmentUnitId, direction })
    .onConflictDoNothing();
  return load();
}

/** A Duty as an Event shows it: `id` is null while nobody has acted on it, so no row exists yet. */
export type EventDuty = Omit<Duty, "id"> & { id: string | null };

/**
 * An Event's To and From Duty for each given Equipment Unit, read-only. A Duty with no
 * row yet reads as blank: nobody on it, not Confirmed, going back Home. Rows are only
 * created when someone acts on a Duty (`actOnEventDuty`). On a Cancelled Event a blank
 * Duty reads as voided, like the stored ones.
 */
export async function listEventDuties(
  db: Db,
  eventId: string,
  equipmentUnitIds: string[],
  { cancelled }: { cancelled: boolean },
): Promise<EventDuty[]> {
  if (equipmentUnitIds.length === 0) return [];
  const rows = await db
    .select()
    .from(duty)
    .where(and(eq(duty.eventId, eventId), inArray(duty.equipmentUnitId, equipmentUnitIds)));
  const sharesByDuty = await loadSharesFor(db, rows.map((r) => r.id));
  return equipmentUnitIds.flatMap((equipmentUnitId) =>
    (["to", "from"] as const).map((direction): EventDuty => {
      const row = rows.find((r) => r.equipmentUnitId === equipmentUnitId && r.direction === direction);
      if (row) return toDuty(row, sharesByDuty.get(row.id) ?? []);
      return {
        id: null,
        eventId,
        equipmentUnitId,
        direction,
        destination: { type: "home" },
        confirmedAt: null,
        voidedAt: cancelled ? new Date() : null,
        userIds: [],
        shares: {},
        confirmedUserIds: [],
      };
    }),
  );
}

/**
 * Does what the viewer asked on an Event's Duty, named by Equipment Unit and direction.
 * Creates the Duty first if it doesn't exist yet. A Cancelled Event gets no new Duties.
 */
export async function actOnEventDuty(
  db: Db,
  eventId: string,
  equipmentUnitId: string,
  direction: "to" | "from",
  viewer: { id: string; role: Role },
  request: DutyRequest,
): Promise<Result> {
  const found = await getEvent(db, eventId);
  if (!found) return { ok: false, error: "That event no longer exists." };
  const checklist = await resolveEventChecklist(db, found);
  if (!checklist.items.some((i) => i.equipmentUnitId === equipmentUnitId)) {
    return { ok: false, error: "That equipment isn't on this event's list." };
  }
  if (found.cancelled) return { ok: false, error: "That event was cancelled, so there's nothing to do." };
  const target = await ensureDuty(db, eventId, equipmentUnitId, direction);
  if (!target) return { ok: false, error: "That duty no longer exists." };
  return applyDutyRequest(db, target, viewer, request);
}

type DutyRow = typeof duty.$inferSelect;

/**
 * Committee sets a Duty's whole membership (a multi-select): adds and removes anyone, and says
 * how many each is taking (`counts`; anyone not named keeps their number, or has all of it).
 * Anyone who has already marked their part done stays exactly as they are.
 */
async function assignDuty(
  db: Db,
  row: DutyRow,
  current: Share[],
  userIds: string[],
  counts: Record<string, number> = {},
): Promise<Result> {
  const currentIds = current.map((s) => s.userId);
  const added = userIds.filter((id) => !currentIds.includes(id));
  const approved = await filterApprovedUserIds(db, added);
  if (added.some((id) => !approved.has(id))) return { ok: false, error: "That person isn't a member of the club." };

  const result = userIds.map((userId): Share => {
    const before = current.find((s) => s.userId === userId);
    return { userId, count: userId in counts ? counts[userId] : (before?.count ?? null), confirmed: before?.confirmed };
  });
  const doneStays = current.filter((s) => s.confirmed).every((s) => result.some((r) => r.userId === s.userId && r.count === s.count));
  if (!doneStays) return { ok: false, error: "Someone on it has already marked their part as done." };
  if (current.some((s) => s.confirmed) && result.some((r) => r.count === null)) return { ok: false, error: "Say how many each person is taking." };
  const valid = validateShares(await checklistCountFor(db, row, 1), result);
  if (!valid.ok) return valid;

  for (const id of currentIds.filter((id) => !userIds.includes(id))) await removeUser(db, row, id);
  for (const r of result) {
    if (!currentIds.includes(r.userId)) await addUser(db, row, r.userId, r.count);
    else if (r.count !== current.find((s) => s.userId === r.userId)!.count) {
      await db.update(dutyUser).set({ count: r.count }).where(and(eq(dutyUser.dutyId, row.id), eq(dutyUser.userId, r.userId)));
    }
  }
  return { ok: true };
}

/** A Person changes how many they're taking, within what's left after everyone else. */
async function setShare(db: Db, row: DutyRow, current: Share[], userId: string, count: number): Promise<Result> {
  const valid = validateShare(await checklistCountFor(db, row, 1), current.filter((s) => s.userId !== userId), count);
  if (!valid.ok) return valid;
  await db.update(dutyUser).set({ count }).where(and(eq(dutyUser.dutyId, row.id), eq(dutyUser.userId, userId)));
  return { ok: true };
}

/** A User hands their own place on a Duty to someone else. */
async function handOnDuty(db: Db, row: DutyRow, current: Share[], actorId: string, toUserId: string): Promise<Result> {
  if (current.some((s) => s.userId === toUserId)) return { ok: false, error: "They're already on it." };
  if (!(await filterApprovedUserIds(db, [toUserId])).has(toUserId)) {
    return { ok: false, error: "That person isn't a member of the club." };
  }
  await removeUser(db, row, actorId);
  await addUser(db, row, toUserId, current.find((s) => s.userId === actorId)?.count ?? null);
  return { ok: true };
}

async function setDestination(db: Db, row: DutyRow, destination: DutyDestination): Promise<Result> {
  await db
    .update(duty)
    .set({
      destinationType: destination.type,
      destinationStoreId: destination.type === "store" ? destination.storeId : null,
    })
    .where(eq(duty.id, row.id));
  return { ok: true };
}

/** The Checklist line's effective count for this Duty's Event and Equipment Unit, capped at `fallbackQuantity`. */
async function checklistCountFor(
  db: Db,
  dutyRow: { eventId: string; equipmentUnitId: string },
  fallbackQuantity: number,
): Promise<number> {
  const event = await getEvent(db, dutyRow.eventId);
  if (!event) return fallbackQuantity;
  return countFromResolved(await resolveEventChecklist(db, event), dutyRow.equipmentUnitId, fallbackQuantity);
}

/** A Checklist line's effective count from an already-resolved Event Checklist. */
function countFromResolved(
  resolved: ResolvedEventChecklist | undefined,
  equipmentUnitId: string,
  fallbackQuantity: number,
): number {
  return resolved?.items.find((i) => i.equipmentUnitId === equipmentUnitId)?.count ?? fallbackQuantity;
}

/**
 * "Who has how many": when the Duty has one User, or the count is 1, there's only one
 * answer. Otherwise a given split is validated, and the default is everything with
 * whoever is Confirming.
 */
function resolveHolderSplit(
  userIds: string[],
  count: number,
  confirmerId: string,
  provided?: HolderPart[],
): Result<{ parts: HolderPart[] }> {
  if (userIds.length <= 1) return { ok: true, parts: [{ userId: userIds[0], count }] };
  if (provided) {
    const check = validateHolderSplit(count, provided, userIds);
    if (!check.ok) return check;
    return { ok: true, parts: provided.filter((p) => p.count > 0) };
  }
  return { ok: true, parts: [{ userId: confirmerId, count }] };
}

/**
 * The Duty's User, or any Committee member, Confirms a Duty: this records a Move of
 * the Checklist line's effective count (not necessarily the Equipment Unit's whole
 * Quantity). A To Duty's count is gathered from a source Place (or several — see
 * `gatherConfirmSources`), defaulted unless the confirm sheet gives one. A From Duty's
 * count comes from the Duty's own People, unless the Confirm names where it is (see `handedOnSources`). When the Duty has several People and
 * the count is more than one, "who has how many" decides the final Holders (To Duty,
 * or a From Duty staying with them) — defaulted to all with whoever Confirms.
 */
export async function confirmDuty(
  db: Db,
  dutyId: string,
  actor: { id: string; role: Role },
  options?: { from?: SourcePart[]; holders?: HolderPart[] },
): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  if (row.voidedAt) return { ok: false, error: "That event was cancelled, so there's nothing to do." };
  const shares = await sharesOf(db, dutyId);
  const userIds = shares.map((s) => s.userId);
  if (userIds.length === 0) return { ok: false, error: "Nobody is doing that yet." };
  if (row.confirmedAt || pendingShares(shares).length === 0) return { ok: false, error: "That's already confirmed." };
  if (!userIds.includes(actor.id) && !isCommitteeOrAbove(actor.role)) {
    return { ok: false, error: "Only the person doing it or the committee can confirm it." };
  }

  // Under the Equipment Unit's lock, so the sources are picked from its Portions as they are now.
  // The Duty (or, when everyone gave a number, each Person still to do) is claimed as confirmed
  // first: if someone else's Confirm got there, this one stops.
  // The Move and "confirmed" go together: if the Move fails, both roll back and the Duty stays
  // open to retry.
  try {
    return await withUnitLock(db, row.equipmentUnitId, async (tx): Promise<Result> => {
      // Read again under the lock: a Confirm or a claim may have just landed.
      const now = await sharesOf(tx, dutyId);
      const sharedByNumber = holdersFromShares(now) !== undefined;
      const pending = pendingShares(now);
      const claimed = sharedByNumber
        ? await tx
            .update(dutyUser)
            .set({ confirmedAt: new Date() })
            .where(and(eq(dutyUser.dutyId, dutyId), inArray(dutyUser.userId, pending.map((p) => p.userId)), isNull(dutyUser.confirmedAt)))
            .returning({ id: dutyUser.id })
        : await tx
            .update(duty)
            .set({ confirmedAt: new Date() })
            .where(and(eq(duty.id, dutyId), isNull(duty.confirmedAt)))
            .returning({ id: duty.id });
      if (claimed.length === 0 || pending.length === 0) return { ok: false, error: "That's already confirmed." };

      const equipment = await getEquipmentUnit(tx, row.equipmentUnitId);
      if (!equipment) throw new Rollback({ ok: false, error: "That equipment no longer exists." });
      const moved = await recordConfirmMove(tx, row, equipment, pending, actor, options);
      if (!moved.ok) throw new Rollback(moved);
      // Done once all of the line is claimed and every claim is done; until then the rest can still be taken.
      if (sharedByNumber && unclaimed(await checklistCountFor(tx, row, equipment.quantity), now) === 0) {
        await tx.update(duty).set({ confirmedAt: new Date() }).where(and(eq(duty.id, dutyId), isNull(duty.confirmedAt)));
      }
      return moved;
    });
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }
}

/** Thrown inside a transaction to roll it back and return `result` instead. */
class Rollback {
  constructor(readonly result: Result) {}
}

async function recordConfirmMove(
  db: Db,
  row: typeof duty.$inferSelect,
  equipment: { id: string; homeId: string; quantity: number },
  shares: Share[],
  actor: { id: string; role: Role },
  options?: { from?: SourcePart[]; holders?: HolderPart[] },
): Promise<Result> {
  const userIds = shares.map((s) => s.userId);
  const count = countToMove(await checklistCountFor(db, row, equipment.quantity), shares);
  const portions = await loadPortions(db, row.equipmentUnitId);

  const toHolders = () => {
    const holderSplit = resolveHolderSplit(userIds, count, actor.id, options?.holders ?? holdersFromShares(shares));
    return holderSplit.ok
      ? { ok: true as const, targets: holderSplit.parts.map((p) => ({ to: { type: "holder", holderId: p.userId } as const, count: p.count })) }
      : holderSplit;
  };

  if (row.direction === "to" || row.destinationType === "holder") {
    const holders = toHolders();
    if (!holders.ok) return holders;
    const parts =
      options?.from ??
      (row.direction === "to"
        ? gatherConfirmSources(portions, { dutyUserIds: userIds, homeStoreId: equipment.homeId, count }).sources
        : gatherFromDutyUsers(portions, { userIds, count }).sources);
    return recordSplitMove(db, equipment.id, actor.id, "duty", { sources: toSources(parts), targets: holders.targets });
  }

  const parts = options?.from ?? gatherFromDutyUsers(portions, { userIds, count }).sources;
  const storeId = row.destinationType === "store" && row.destinationStoreId ? row.destinationStoreId : equipment.homeId;
  return recordSplitMove(db, equipment.id, actor.id, "duty", { sources: toSources(parts), targets: [{ to: { type: "store", storeId }, count }] });
}

/** `SourcePart` (`{ place, count }`, the domain vocabulary) to `recordSplitMove`'s `{ from, count }`. */
function toSources(parts: SourcePart[]) {
  return parts.map((p) => ({ from: p.place, count: p.count }));
}

export type DutyRequest =
  | { action: "claim"; count?: number }
  | { action: "confirm"; from?: SourcePart[]; holders?: HolderPart[] }
  | { action: "handOn"; userId: string }
  | { action: "leave" }
  | { action: "setShare"; count: number }
  | { action: "assign"; userIds: string[]; counts?: Record<string, number> }
  | { action: "setDestination"; destination: DutyDestination };

/** Does what the viewer asked on one Duty, if `dutyActions` allows it. */
export async function actOnDuty(
  db: Db,
  dutyId: string,
  viewer: { id: string; role: Role },
  request: DutyRequest,
): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  return applyDutyRequest(db, row, viewer, request);
}

async function applyDutyRequest(
  db: Db,
  row: DutyRow,
  viewer: { id: string; role: Role },
  request: DutyRequest,
): Promise<Result> {
  const shares = await sharesOf(db, row.id);
  const userIds = shares.map((s) => s.userId);
  const allowed: DutyAction[] = dutyActions(
    {
      direction: row.direction,
      userIds,
      doneUserIds: shares.filter((s) => s.confirmed).map((s) => s.userId),
      confirmed: !!row.confirmedAt,
      voided: !!row.voidedAt,
    },
    { viewerId: viewer.id, committee: isCommitteeOrAbove(viewer.role) },
  );
  if (!allowed.includes(request.action)) return { ok: false, error: "You can't do that on this duty." };
  switch (request.action) {
    case "claim": {
      if (request.count === undefined && shares.some((s) => s.confirmed)) return { ok: false, error: "Say how many you're taking." };
      if (request.count !== undefined) {
        const valid = validateShare(await checklistCountFor(db, row, 1), shares, request.count);
        if (!valid.ok) return valid;
      }
      await addUser(db, row, viewer.id, request.count ?? null);
      return { ok: true };
    }
    case "leave":
      await removeUser(db, row, viewer.id);
      return { ok: true };
    case "confirm": {
      const result = await confirmDuty(db, row.id, viewer, { from: request.from, holders: request.holders });
      if (result.ok) await markUnconfirmed(db);
      return result;
    }
    case "handOn":
      return handOnDuty(db, row, shares, viewer.id, request.userId);
    case "assign":
      return assignDuty(db, row, shares, request.userIds, request.counts);
    case "setShare":
      return setShare(db, row, shares, viewer.id, request.count);
    case "setDestination":
      return setDestination(db, row, request.destination);
  }
}

/** Who is on an Event's Duties for each of these Equipment Units. Units nobody is on are left out. */
export async function listPeopleOnEquipment(
  db: Db,
  eventId: string,
  equipmentUnitIds: string[],
): Promise<Map<string, Set<string>>> {
  const people = new Map<string, Set<string>>();
  if (equipmentUnitIds.length === 0) return people;
  const rows = await db
    .select({ equipmentUnitId: duty.equipmentUnitId, userId: dutyUser.userId })
    .from(duty)
    .innerJoin(dutyUser, eq(dutyUser.dutyId, duty.id))
    .where(and(eq(duty.eventId, eventId), inArray(duty.equipmentUnitId, equipmentUnitIds)));
  for (const r of rows) people.set(r.equipmentUnitId, (people.get(r.equipmentUnitId) ?? new Set()).add(r.userId));
  return people;
}

/** Deletes an Event's Duties, People and all — only for these Equipment Units when given (they came off its Checklist). */
export async function deleteDuties(db: Db, eventId: string, equipmentUnitIds?: string[]) {
  if (equipmentUnitIds && equipmentUnitIds.length === 0) return;
  // Who was on each Duty goes with it (ON DELETE CASCADE).
  await db
    .delete(duty)
    .where(and(eq(duty.eventId, eventId), equipmentUnitIds ? inArray(duty.equipmentUnitId, equipmentUnitIds) : undefined));
}

export async function voidDutiesForEvent(db: Db, eventId: string) {
  await db.update(duty).set({ voidedAt: new Date() }).where(eq(duty.eventId, eventId));
}

/**
 * Once an Event has ended, an Equipment Unit still held by the To Duty's People whose From
 * Duty wasn't Confirmed becomes Unconfirmed — up to the Checklist line's count, taken
 * from whichever of them hold it (in order). The app never assumes a Move happened.
 */
export async function markUnconfirmed(db: Db) {
  // Only From Duties that could need it: not Confirmed, on an ended, uncancelled Event,
  // whose To Duty was Confirmed. Usually there are none, and this is the only query.
  const toDuty = alias(duty, "to_duty");
  const fromRows: {
    eventId: string;
    equipmentUnitId: string;
    toDutyId: string;
    toConfirmedAt: Date | null;
    eventEnd: Date;
    seriesId: string | null;
    eventType: string;
  }[] = await db
    .select({
      eventId: duty.eventId,
      equipmentUnitId: duty.equipmentUnitId,
      toDutyId: toDuty.id,
      toConfirmedAt: toDuty.confirmedAt,
      eventEnd: event.end,
      seriesId: event.seriesId,
      eventType: event.eventType,
    })
    .from(duty)
    .innerJoin(
      toDuty,
      and(
        eq(toDuty.eventId, duty.eventId),
        eq(toDuty.equipmentUnitId, duty.equipmentUnitId),
        eq(toDuty.direction, "to"),
        isNotNull(toDuty.confirmedAt),
        isNull(toDuty.voidedAt),
      ),
    )
    .innerJoin(event, eq(event.id, duty.eventId))
    .where(
      and(
        eq(duty.direction, "from"),
        isNull(duty.confirmedAt),
        isNull(duty.voidedAt),
        lt(event.end, new Date()),
        eq(event.cancelled, false),
      ),
    );
  if (fromRows.length === 0) return;
  const equipmentUnitIds = [...new Set(fromRows.map((r) => r.equipmentUnitId))];
  const [userIdsByDuty, checklistsByEvent, equipmentUnits, portions] = await Promise.all([
    loadUserIdsFor(db, fromRows.map((r) => r.toDutyId)),
    resolveEventChecklists(db, fromRows.map((r) => ({ id: r.eventId, seriesId: r.seriesId, eventType: r.eventType }))),
    listEquipmentUnitsByIds(db, equipmentUnitIds),
    listPortionsFor(db, equipmentUnitIds),
  ]);
  const equipmentById = new Map(equipmentUnits.map((k) => [k.id, k]));
  const portionsByEquipment = Map.groupBy(portions, (p) => p.equipmentUnitId);

  for (const from of fromRows) {
    const toUserIds = userIdsByDuty.get(from.toDutyId) ?? [];
    if (toUserIds.length === 0) continue;
    const equipment = equipmentById.get(from.equipmentUnitId);
    if (!equipment) continue;
    const count = countFromResolved(checklistsByEvent.get(from.eventId), from.equipmentUnitId, equipment.quantity);
    const held = gatherHeldBy(portionsByEquipment.get(equipment.id) ?? [], { userIds: toUserIds, count });
    if (held.sources.length === 0) continue;
    // Anyone recording a Move since the Event ended (or since the To Duty was Confirmed late) has
    // sorted it out already: put back, "I've got it", or Confirmed onto the next Event.
    const since = from.toConfirmedAt && from.toConfirmedAt > from.eventEnd ? from.toConfirmedAt : from.eventEnd;
    if (await hasMoveSince(db, equipment.id, since)) continue;
    await setUnconfirmedOnce(db, equipment.id, from.eventId, held.sources);
  }
}

/** Takes a Blocked or deleted User off their Duties on upcoming, unconfirmed Events. */
export async function releaseUpcomingDuties(db: Db, userId: string) {
  const upcoming = (await listEvents(db, { when: "upcoming" })).map((e) => e.id);
  if (upcoming.length === 0) return;
  const rows = await db
    .select()
    .from(duty)
    .where(and(inArray(duty.eventId, upcoming), isNull(duty.confirmedAt)));
  const sharesByDuty = await loadSharesFor(db, rows.map((r) => r.id));
  await Promise.all(
    rows
      .filter((row) => (sharesByDuty.get(row.id) ?? []).some((s) => s.userId === userId && !s.confirmed))
      .map((row) => removeUser(db, row, userId)),
  );
}

/** The User's Duties still to do on upcoming, uncancelled Events, soonest Event first. */
export async function listUpcomingDutiesForUser(db: Db, userId: string) {
  const events = (await listEvents(db, { when: "upcoming", cancelled: false }));
  if (events.length === 0) return [];
  const rows = await db
    .select({
      id: duty.id,
      eventId: duty.eventId,
      equipmentUnitId: duty.equipmentUnitId,
      direction: duty.direction,
      destinationType: duty.destinationType,
      destinationStoreId: duty.destinationStoreId,
      confirmedAt: duty.confirmedAt,
      voidedAt: duty.voidedAt,
    })
    .from(duty)
    .innerJoin(dutyUser, eq(dutyUser.dutyId, duty.id))
    .where(
      and(
        eq(dutyUser.userId, userId),
        isNull(dutyUser.confirmedAt),
        inArray(
          duty.eventId,
          events.map((e) => e.id),
        ),
        isNull(duty.confirmedAt),
        isNull(duty.voidedAt),
      ),
    );
  const eventIdsWithDuties = new Set(rows.map((r) => r.eventId));
  const [sharesByDuty, checklistsByEvent, equipmentUnits] = await Promise.all([
    loadSharesFor(db, rows.map((r) => r.id)),
    resolveEventChecklists(db, events.filter((e) => eventIdsWithDuties.has(e.id))),
    listEquipmentUnitsByIds(db, rows.map((r) => r.equipmentUnitId)),
  ]);
  const equipmentUnitById = new Map(equipmentUnits.map((k) => [k.id, k]));
  return events.flatMap((event) =>
    rows
      .filter((r) => r.eventId === event.id)
      .map((r) => ({
        duty: toDuty(r, sharesByDuty.get(r.id) ?? []),
        event,
        count: countFromResolved(checklistsByEvent.get(event.id), r.equipmentUnitId, equipmentUnitById.get(r.equipmentUnitId)?.quantity ?? 1),
      })),
  );
}

/** Every User on any (non-voided) Duty of each of `eventIds`, grouped by Event. */
export async function listDutyUserIdsByEvent(db: Db, eventIds: string[]): Promise<Map<string, Set<string>>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: duty.eventId, userId: dutyUser.userId })
    .from(duty)
    .innerJoin(dutyUser, eq(dutyUser.dutyId, duty.id))
    .where(and(inArray(duty.eventId, eventIds), isNull(duty.voidedAt)));
  const byEvent = new Map<string, Set<string>>();
  for (const row of rows) byEvent.set(row.eventId, (byEvent.get(row.eventId) ?? new Set()).add(row.userId));
  return byEvent;
}

export type PastDutyRecord = {
  dutyId: string;
  direction: "to" | "from";
  confirmedAt: Date | null;
  equipmentUnitId: string;
  event: { id: string; title: string; end: Date };
};

/**
 * A User's duty record for the Player page: their Duties still to do, this season's
 * Confirmed/never-confirmed split (1 Sep–31 Aug, Cancelled Events left out), and their
 * last 5 past Duties.
 */
export async function listDutyRecordForUser(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<{
  upcoming: Awaited<ReturnType<typeof listUpcomingDutiesForUser>>;
  season: { done: number; neverConfirmed: number };
  last: PastDutyRecord[];
}> {
  const upcoming = await listUpcomingDutiesForUser(db, userId);
  const rows = await db
    .select({
      id: duty.id,
      equipmentUnitId: duty.equipmentUnitId,
      direction: duty.direction,
      confirmedAt: duty.confirmedAt,
      personConfirmedAt: dutyUser.confirmedAt,
      eventId: event.id,
      eventTitle: event.title,
      eventEnd: event.end,
    })
    .from(duty)
    .innerJoin(dutyUser, eq(dutyUser.dutyId, duty.id))
    .innerJoin(event, eq(event.id, duty.eventId))
    .where(and(eq(dutyUser.userId, userId), lt(event.end, now), eq(event.cancelled, false), isNull(duty.voidedAt)));
  const records: PastDutyRecord[] = rows.map((r) => ({
    dutyId: r.id,
    direction: r.direction,
    confirmedAt: r.personConfirmedAt ?? r.confirmedAt,
    equipmentUnitId: r.equipmentUnitId,
    event: { id: r.eventId, title: r.eventTitle, end: r.eventEnd },
  }));
  return {
    upcoming,
    season: seasonCount(records.map((r) => ({ eventEnd: r.event.end, confirmedAt: r.confirmedAt })), now),
    last: lastDuties(records.map((r) => ({ ...r, eventEnd: r.event.end })), 5),
  };
}

/**
 * Narrows the plan to one Equipment Unit, or to the Equipment Units on one Event's Checklist.
 * Warnings are per Equipment Unit, so a scoped plan gives exactly that part of the full answer.
 */
export type PlanScope = { equipmentUnitId: string } | { eventId: string };

/** The equipment plan for every upcoming, uncancelled Event. Read-only: it never creates Duties. */
async function loadPlan(db: Db, scope?: PlanScope): Promise<{ equipment: PlanEquipment[]; events: PlanEvent[] }> {
  const events = (await listEvents(db, { when: "upcoming", cancelled: false }));
  if (events.length === 0) return { equipment: [], events: [] };
  const [equipment, dutyRows] = await Promise.all([
    listEquipmentUnits(db, { includeRetired: true }),
    db
      .select()
      .from(duty)
      .where(
        and(
          inArray(
            duty.eventId,
            events.map((e) => e.id),
          ),
          isNull(duty.voidedAt),
        ),
      ) as Promise<(typeof duty.$inferSelect)[]>,
  ]);
  const checklistsByEvent = await resolveEventChecklists(db, events);
  const itemsOf = (eventId: string) => checklistsByEvent.get(eventId)?.items ?? [];
  const inScope: Set<string> | undefined = !scope
    ? undefined
    : "equipmentUnitId" in scope
      ? new Set([scope.equipmentUnitId])
      : new Set(itemsOf(scope.eventId).map((i) => i.equipmentUnitId));
  const wanted = inScope ? equipment.filter((k) => inScope.has(k.id)) : equipment;
  const [sharesByDuty, portions] = await Promise.all([
    loadSharesFor(db, dutyRows.filter((d) => !inScope || inScope.has(d.equipmentUnitId)).map((r) => r.id)),
    listPortionsFor(db, wanted.map((k) => k.id)),
  ]);
  const planEvents: PlanEvent[] = events
    .map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    startTbc: e.startTbc,
    end: e.end,
    items: itemsOf(e.id).filter((i) => !inScope || inScope.has(i.equipmentUnitId)),
    duties: dutyRows
      .filter((d) => d.eventId === e.id && (!inScope || inScope.has(d.equipmentUnitId)))
      .map((d) => {
        const shares = sharesByDuty.get(d.id) ?? [];
        return { equipmentUnitId: d.equipmentUnitId, direction: d.direction, userIds: shares.map((s) => s.userId), shares: shares.map((s) => s.count) };
      }),
    }))
    .filter((e) => !inScope || e.items.length > 0);
  const portionsByUnit = Map.groupBy(portions, (p) => p.equipmentUnitId);
  return {
    equipment: wanted.map((k) => ({
      id: k.id,
      name: k.name,
      status: k.status,
      quantity: k.quantity,
      portions: (portionsByUnit.get(k.id) ?? [])
        .filter((p) => p.whereaboutsType !== "unconfirmed")
        .map((p) => ({ storeId: p.storeId, holderId: p.holderId, count: p.count })),
    })),
    events: planEvents,
  };
}

/** Clashes and heads-ups together, from one load of the equipment plan. */
export async function listPlanWarnings(
  db: Db,
  now: Date = new Date(),
  scope?: PlanScope,
): Promise<{ clashes: Clash[]; headsUps: HeadsUp[] }> {
  const [plan, name] = await Promise.all([loadPlan(db, scope), loadNames(db)]);
  return {
    clashes: findClashes(plan),
    headsUps: findHeadsUps({ now, ...plan, personName: name }),
  };
}
