import type { Db } from "@/db/types";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { resolveEventChecklist, resolveEventChecklists, type ResolvedEventChecklist } from "@/features/checklists";
import { event, getEvent, listEvents } from "@/features/events";
import {
  getEquipmentUnit,
  getPortions,
  hasMoveSince,
  listEquipmentUnits,
  listEquipmentUnitsByIds,
  listPortionsFor,
  recordSplitMove,
  setUnconfirmed,
  withUnitLock,
} from "@/features/equipment";
import { displayName, filterApprovedUserIds, isCommitteeOrAbove, listKnownUsers, type Role } from "@/features/users";
import { findClashes, type Clash } from "./clashes-rules";
import { gatherConfirmSources, gatherFromDutyUsers, gatherHeldBy, validateHolderSplit, type HolderPart, type SourcePart } from "./confirm-source-rules";
import { dutyActions, type DutyAction } from "./duty-actions-rules";
import { lastDuties, seasonCount } from "./duty-record-rules";
import { findHeadsUps, type HeadsUp } from "./heads-up-rules";
import { joinNames } from "./names-rules";
import type { PlanEvent, PlanEquipment } from "./plan";
import { duty, dutyUser } from "./schema";

export { duty } from "./schema";
export type { Clash } from "./clashes-rules";
export type { HeadsUp } from "./heads-up-rules";
export { dutyActions } from "./duty-actions-rules";
export type { DutyAction } from "./duty-actions-rules";
export { joinNames } from "./names-rules";
export { seasonStart } from "./duty-record-rules";
export { gatherConfirmSources, handedOnSources, needsSourceChoice } from "./confirm-source-rules";
export { parseSourceValue, sourceValue } from "./source-value";
export type { HolderPart, SourcePart } from "./confirm-source-rules";


export type DutyDestination = { type: "home" } | { type: "store"; storeId: string } | { type: "holder" };
export type Duty = Omit<typeof duty.$inferSelect, "destinationType" | "destinationStoreId"> & {
  destination: DutyDestination;
  /** Everyone currently on this Duty (Shared Duties: zero or more). */
  userIds: string[];
};
type Result = { ok: true } | { ok: false; error: string };

function toDuty(row: typeof duty.$inferSelect, userIds: string[]): Duty {
  const { destinationType, destinationStoreId, ...rest } = row;
  const destination: DutyDestination =
    destinationType === "store" && destinationStoreId
      ? { type: "store", storeId: destinationStoreId }
      : destinationType === "holder"
        ? { type: "holder" }
        : { type: "home" };
  return { ...rest, destination, userIds };
}

async function getDuty(db: Db, id: string): Promise<typeof duty.$inferSelect | undefined> {
  const [row] = await db.select().from(duty).where(eq(duty.id, id));
  return row;
}

/** Everyone currently on a Duty. */
async function userIdsOf(db: Db, dutyId: string): Promise<string[]> {
  const rows: { userId: string }[] = await db.select({ userId: dutyUser.userId }).from(dutyUser).where(eq(dutyUser.dutyId, dutyId));
  return rows.map((r) => r.userId);
}

/** Everyone currently on several Duties, in one query. */
async function loadUserIdsFor(db: Db, dutyIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (dutyIds.length === 0) return map;
  const rows: { dutyId: string; userId: string }[] = await db.select().from(dutyUser).where(inArray(dutyUser.dutyId, dutyIds));
  for (const r of rows) map.set(r.dutyId, [...(map.get(r.dutyId) ?? []), r.userId]);
  return map;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** The sibling From Duty for a To Duty (same Event, same Equipment Unit), if any. */
async function siblingFromDuty(db: Db, toRow: typeof duty.$inferSelect): Promise<typeof duty.$inferSelect | undefined> {
  if (toRow.direction !== "to") return undefined;
  const [row] = await db
    .select()
    .from(duty)
    .where(and(eq(duty.eventId, toRow.eventId), eq(duty.equipmentUnitId, toRow.equipmentUnitId), eq(duty.direction, "from")));
  return row;
}

/**
 * From follows To: while the From Duty's People are exactly the To Duty's People (true
 * for two Duties freshly created together, and for as long as nobody has changed the
 * From Duty separately), a change to the To Duty's People carries across to the From
 * Duty too. Once Committee (or anyone handing/leaving on the From Duty alone) makes the
 * two sets differ, the From Duty stops following.
 */
async function isFollowing(db: Db, toRow: typeof duty.$inferSelect): Promise<typeof duty.$inferSelect | undefined> {
  const from = await siblingFromDuty(db, toRow);
  if (!from) return undefined;
  const [toIds, fromIds] = await Promise.all([userIdsOf(db, toRow.id), userIdsOf(db, from.id)]);
  return sameSet(toIds, fromIds) ? from : undefined;
}

async function addUser(db: Db, row: typeof duty.$inferSelect, userId: string) {
  const following = await isFollowing(db, row);
  await db.insert(dutyUser).values({ id: crypto.randomUUID(), dutyId: row.id, userId }).onConflictDoNothing();
  if (following) await db.insert(dutyUser).values({ id: crypto.randomUUID(), dutyId: following.id, userId }).onConflictDoNothing();
}

async function removeUser(db: Db, row: typeof duty.$inferSelect, userId: string) {
  const following = await isFollowing(db, row);
  await db.delete(dutyUser).where(and(eq(dutyUser.dutyId, row.id), eq(dutyUser.userId, userId)));
  if (following) await db.delete(dutyUser).where(and(eq(dutyUser.dutyId, following.id), eq(dutyUser.userId, userId)));
}

/** Makes sure each Equipment Unit on the Event's Checklist has its To and From Duty, and returns them. */
export async function ensureDuties(db: Db, eventId: string, equipmentUnitIds: string[]): Promise<Duty[]> {
  if (equipmentUnitIds.length === 0) return [];
  const load = (): Promise<(typeof duty.$inferSelect)[]> =>
    db
      .select()
      .from(duty)
      .where(and(eq(duty.eventId, eventId), inArray(duty.equipmentUnitId, equipmentUnitIds)));
  let rows = await load();
  // Usually they all exist already, so viewing an Event stays read-only.
  const missing = equipmentUnitIds.flatMap((equipmentUnitId) =>
    (["to", "from"] as const)
      .filter((direction) => !rows.some((r) => r.equipmentUnitId === equipmentUnitId && r.direction === direction))
      .map((direction) => ({ id: crypto.randomUUID(), eventId, equipmentUnitId, direction })),
  );
  if (missing.length > 0) {
    await db.insert(duty).values(missing).onConflictDoNothing();
    rows = await load();
  }
  const userIdsByDuty = await loadUserIdsFor(db, rows.map((r) => r.id));
  return rows.map((r) => toDuty(r, userIdsByDuty.get(r.id) ?? []));
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
  const rows: (typeof duty.$inferSelect)[] = await db
    .select()
    .from(duty)
    .where(and(eq(duty.eventId, eventId), inArray(duty.equipmentUnitId, equipmentUnitIds)));
  const userIdsByDuty = await loadUserIdsFor(db, rows.map((r) => r.id));
  return equipmentUnitIds.flatMap((equipmentUnitId) =>
    (["to", "from"] as const).map((direction): EventDuty => {
      const row = rows.find((r) => r.equipmentUnitId === equipmentUnitId && r.direction === direction);
      if (row) return toDuty(row, userIdsByDuty.get(row.id) ?? []);
      return {
        id: null,
        eventId,
        equipmentUnitId,
        direction,
        destination: { type: "home" },
        confirmedAt: null,
        voidedAt: cancelled ? new Date() : null,
        userIds: [],
      };
    }),
  );
}

/**
 * Does what the viewer asked on an Event's Duty, named by Equipment Unit and direction.
 * Creates the Equipment Unit's To and From Duties first if they don't exist yet (so
 * "From follows To" still works). A Cancelled Event gets no new Duties.
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
  const checklist = await resolveEventChecklist(db, { eventId, seriesId: found.seriesId, eventType: found.eventType });
  if (!checklist.items.some((i) => i.equipmentUnitId === equipmentUnitId)) {
    return { ok: false, error: "That equipment isn't on this event's list." };
  }
  if (found.cancelled) {
    const [existing] = await db
      .select({ id: duty.id })
      .from(duty)
      .where(and(eq(duty.eventId, eventId), eq(duty.equipmentUnitId, equipmentUnitId), eq(duty.direction, direction)));
    if (!existing) return { ok: false, error: "That event was cancelled, so there's nothing to do." };
    return actOnDuty(db, existing.id, viewer, request);
  }
  const target = (await ensureDuties(db, eventId, [equipmentUnitId])).find((d) => d.direction === direction);
  if (!target) return { ok: false, error: "That duty no longer exists." };
  return actOnDuty(db, target.id, viewer, request);
}

/** Any Member joins a Duty — whether it's unfilled or already has other People on it. */
export async function claimDuty(db: Db, dutyId: string, userId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  const ids = await userIdsOf(db, dutyId);
  if (ids.includes(userId)) return { ok: false, error: "You're already on it." };
  await addUser(db, row, userId);
  return { ok: true };
}

/** A User takes themselves off a Duty. */
export async function leaveDuty(db: Db, dutyId: string, userId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  const ids = await userIdsOf(db, dutyId);
  if (!ids.includes(userId)) return { ok: false, error: "You're not on that duty." };
  await removeUser(db, row, userId);
  return { ok: true };
}

/** Committee sets a Duty's whole membership (a multi-select): adds and removes anyone. */
export async function assignDuty(db: Db, dutyId: string, userIds: string[]): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  const current = await userIdsOf(db, dutyId);
  const added = userIds.filter((id) => !current.includes(id));
  const approved = await filterApprovedUserIds(db, added);
  if (added.some((id) => !approved.has(id))) return { ok: false, error: "That person isn't a member of the club." };
  for (const id of current.filter((id) => !userIds.includes(id))) await removeUser(db, row, id);
  for (const id of added) await addUser(db, row, id);
  return { ok: true };
}

/** A User hands their own place on a Duty to someone else. */
export async function handOnDuty(db: Db, dutyId: string, actorId: string, toUserId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  const ids = await userIdsOf(db, dutyId);
  if (!ids.includes(actorId)) return { ok: false, error: "You can only hand on your own place." };
  if (ids.includes(toUserId)) return { ok: false, error: "They're already on it." };
  if (!(await filterApprovedUserIds(db, [toUserId])).has(toUserId)) {
    return { ok: false, error: "That person isn't a member of the club." };
  }
  await removeUser(db, row, actorId);
  await addUser(db, row, toUserId);
  return { ok: true };
}

export async function setDestination(db: Db, dutyId: string, destination: DutyDestination): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  if (row.direction !== "from") return { ok: false, error: "Only the trip back has a destination." };
  await db
    .update(duty)
    .set({
      destinationType: destination.type,
      destinationStoreId: destination.type === "store" ? destination.storeId : null,
    })
    .where(eq(duty.id, dutyId));
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
  const resolved = await resolveEventChecklist(db, {
    eventId: dutyRow.eventId,
    seriesId: event.seriesId,
    eventType: event.eventType,
  });
  return resolved.items.find((i) => i.equipmentUnitId === dutyRow.equipmentUnitId)?.count ?? fallbackQuantity;
}

/** Every given Event's resolved Checklist, once each — not once per Duty on it. */
function resolveChecklistsForEvents(
  db: Db,
  events: { id: string; seriesId: string | null; eventType: string }[],
): Promise<Map<string, ResolvedEventChecklist>> {
  return resolveEventChecklists(
    db,
    events.map((e) => ({ eventId: e.id, seriesId: e.seriesId, eventType: e.eventType })),
  );
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
): { ok: true; parts: HolderPart[] } | { ok: false; error: string } {
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
  const userIds = await userIdsOf(db, dutyId);
  if (userIds.length === 0) return { ok: false, error: "Nobody is doing that yet." };
  if (row.confirmedAt) return { ok: false, error: "That's already confirmed." };
  if (!userIds.includes(actor.id) && !isCommitteeOrAbove(actor.role)) {
    return { ok: false, error: "Only the person doing it or the committee can confirm it." };
  }

  // Under the Equipment Unit's lock, so the sources are picked from its Portions as they are now.
  // The Duty is claimed as confirmed first: if someone else's Confirm got there, this one stops.
  // The Move and "confirmed" go together: if the Move fails, both roll back and the Duty stays
  // open to retry.
  try {
    return await withUnitLock(db, row.equipmentUnitId, async (tx: Db): Promise<Result> => {
      const claimed: { id: string }[] = await tx
        .update(duty)
        .set({ confirmedAt: new Date() })
        .where(and(eq(duty.id, dutyId), isNull(duty.confirmedAt)))
        .returning({ id: duty.id });
      if (claimed.length === 0) return { ok: false, error: "That's already confirmed." };

      const equipment = await getEquipmentUnit(tx, row.equipmentUnitId);
      if (!equipment) throw new Rollback({ ok: false, error: "That equipment no longer exists." });
      const moved = await recordConfirmMove(tx, row, equipment, userIds, actor, options);
      if (!moved.ok) throw new Rollback(moved);
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
  userIds: string[],
  actor: { id: string; role: Role },
  options?: { from?: SourcePart[]; holders?: HolderPart[] },
): Promise<Result> {
  const count = await checklistCountFor(db, row, equipment.quantity);
  const portions = await getPortions(db, row.equipmentUnitId);

  if (row.direction === "to") {
    const holderSplit = resolveHolderSplit(userIds, count, actor.id, options?.holders);
    if (!holderSplit.ok) return holderSplit;
    const parts = options?.from ?? gatherConfirmSources(portions, { dutyUserIds: userIds, homeStoreId: equipment.homeId, count }).sources;
    return recordSplitMove(db, equipment.id, actor.id, "duty", {
      sources: toSources(parts),
      targets: holderSplit.parts.map((p) => ({ to: { type: "holder", holderId: p.userId } as const, count: p.count })),
    });
  }

  const parts = options?.from ?? gatherFromDutyUsers(portions, { userIds, count }).sources;
  if (row.destinationType === "holder") {
    const holderSplit = resolveHolderSplit(userIds, count, actor.id, options?.holders);
    if (!holderSplit.ok) return holderSplit;
    return recordSplitMove(db, equipment.id, actor.id, "duty", {
      sources: toSources(parts),
      targets: holderSplit.parts.map((p) => ({ to: { type: "holder", holderId: p.userId } as const, count: p.count })),
    });
  }
  const storeId = row.destinationType === "store" && row.destinationStoreId ? row.destinationStoreId : equipment.homeId;
  return recordSplitMove(db, equipment.id, actor.id, "duty", { sources: toSources(parts), targets: [{ to: { type: "store", storeId }, count }] });
}

/** `SourcePart` (`{ place, count }`, the domain vocabulary) to `recordSplitMove`'s `{ from, count }`. */
function toSources(parts: SourcePart[]) {
  return parts.map((p) => ({ from: p.place, count: p.count }));
}

/** Cancelling an Event voids all its Duties. */
export type DutyRequest =
  | { action: "claim" }
  | { action: "confirm"; from?: SourcePart[]; holders?: HolderPart[] }
  | { action: "handOn"; userId: string }
  | { action: "leave" }
  | { action: "assign"; userIds: string[] }
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
  const userIds = await userIdsOf(db, dutyId);
  const allowed: DutyAction[] = dutyActions(
    { direction: row.direction, userIds, confirmed: !!row.confirmedAt, voided: !!row.voidedAt },
    { viewerId: viewer.id, committee: isCommitteeOrAbove(viewer.role) },
  );
  if (!allowed.includes(request.action)) return { ok: false, error: "You can't do that on this duty." };
  switch (request.action) {
    case "claim":
      return claimDuty(db, dutyId, viewer.id);
    case "leave":
      return leaveDuty(db, dutyId, viewer.id);
    case "confirm": {
      const result = await confirmDuty(db, dutyId, viewer, { from: request.from, holders: request.holders });
      if (result.ok) await markUnconfirmed(db);
      return result;
    }
    case "handOn":
      return handOnDuty(db, dutyId, viewer.id, request.userId);
    case "assign":
      return assignDuty(db, dutyId, request.userIds);
    case "setDestination":
      return setDestination(db, dutyId, request.destination);
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
  const rows: { equipmentUnitId: string; userId: string }[] = await db
    .select({ equipmentUnitId: duty.equipmentUnitId, userId: dutyUser.userId })
    .from(duty)
    .innerJoin(dutyUser, eq(dutyUser.dutyId, duty.id))
    .where(and(eq(duty.eventId, eventId), inArray(duty.equipmentUnitId, equipmentUnitIds)));
  for (const r of rows) people.set(r.equipmentUnitId, (people.get(r.equipmentUnitId) ?? new Set()).add(r.userId));
  return people;
}

/** Deletes an Event's Duties for these Equipment Units, People and all: they came off its Checklist. */
export async function dropDutiesFor(db: Db, eventId: string, equipmentUnitIds: string[]) {
  if (equipmentUnitIds.length === 0) return;
  const rows: { id: string }[] = await db
    .select({ id: duty.id })
    .from(duty)
    .where(and(eq(duty.eventId, eventId), inArray(duty.equipmentUnitId, equipmentUnitIds)));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await db.delete(dutyUser).where(inArray(dutyUser.dutyId, ids));
  await db.delete(duty).where(inArray(duty.id, ids));
}

export async function voidDutiesForEvent(db: Db, eventId: string) {
  await db.update(duty).set({ voidedAt: new Date() }).where(eq(duty.eventId, eventId));
}

/** Removes every Duty of a deleted Event, and who was on them. */
export async function deleteDutiesForEvent(db: Db, eventId: string) {
  const rows: { id: string }[] = await db.select({ id: duty.id }).from(duty).where(eq(duty.eventId, eventId));
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  await db.delete(dutyUser).where(inArray(dutyUser.dutyId, ids));
  await db.delete(duty).where(inArray(duty.id, ids));
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
    resolveChecklistsForEvents(db, fromRows.map((r) => ({ id: r.eventId, seriesId: r.seriesId, eventType: r.eventType }))),
    listEquipmentUnitsByIds(db, equipmentUnitIds),
    listPortionsFor(db, equipmentUnitIds),
  ]);
  const equipmentById = new Map(equipmentUnits.map((k) => [k.id, k]));
  const portionsByEquipment = new Map<string, typeof portions>();
  for (const p of portions) portionsByEquipment.set(p.equipmentUnitId, [...(portionsByEquipment.get(p.equipmentUnitId) ?? []), p]);

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
    for (const source of held.sources) {
      await setUnconfirmed(db, equipment.id, from.eventId, source.place, source.count);
    }
  }
}

/** Takes a Blocked or deleted User off their Duties on upcoming, unconfirmed Events. */
export async function releaseUpcomingDuties(db: Db, userId: string) {
  const upcoming = (await listEvents(db, { when: "upcoming" })).map((e) => e.id);
  if (upcoming.length === 0) return;
  const rows: (typeof duty.$inferSelect)[] = await db
    .select()
    .from(duty)
    .where(and(inArray(duty.eventId, upcoming), isNull(duty.confirmedAt)));
  const userIdsByDuty = await loadUserIdsFor(db, rows.map((r) => r.id));
  await Promise.all(
    rows
      .filter((row) => (userIdsByDuty.get(row.id) ?? []).includes(userId))
      .map((row) => removeUser(db, row, userId)),
  );
}

/** The User's Duties still to do on upcoming, uncancelled Events, soonest Event first. */
export async function listUpcomingDutiesForUser(db: Db, userId: string) {
  const events = (await listEvents(db, { when: "upcoming" })).filter((e) => !e.cancelled);
  if (events.length === 0) return [];
  const rows: (typeof duty.$inferSelect & { userId: string })[] = await db
    .select({
      id: duty.id,
      eventId: duty.eventId,
      equipmentUnitId: duty.equipmentUnitId,
      direction: duty.direction,
      destinationType: duty.destinationType,
      destinationStoreId: duty.destinationStoreId,
      confirmedAt: duty.confirmedAt,
      voidedAt: duty.voidedAt,
      userId: dutyUser.userId,
    })
    .from(duty)
    .innerJoin(dutyUser, eq(dutyUser.dutyId, duty.id))
    .where(
      and(
        eq(dutyUser.userId, userId),
        inArray(
          duty.eventId,
          events.map((e) => e.id),
        ),
        isNull(duty.confirmedAt),
        isNull(duty.voidedAt),
      ),
    );
  const eventIdsWithDuties = new Set(rows.map((r) => r.eventId));
  const [userIdsByDuty, checklistsByEvent, equipmentUnits] = await Promise.all([
    loadUserIdsFor(db, rows.map((r) => r.id)),
    resolveChecklistsForEvents(db, events.filter((e) => eventIdsWithDuties.has(e.id))),
    listEquipmentUnitsByIds(db, rows.map((r) => r.equipmentUnitId)),
  ]);
  const equipmentUnitById = new Map(equipmentUnits.map((k) => [k.id, k]));
  return events.flatMap((event) =>
    rows
      .filter((r) => r.eventId === event.id)
      .map((r) => ({
        duty: toDuty(r, userIdsByDuty.get(r.id) ?? []),
        event,
        count: countFromResolved(checklistsByEvent.get(event.id), r.equipmentUnitId, equipmentUnitById.get(r.equipmentUnitId)?.quantity ?? 1),
      })),
  );
}

/** Every User on any (non-voided) Duty of each of `eventIds`, grouped by Event. */
export async function listDutyUserIdsByEvent(db: Db, eventIds: string[]): Promise<Map<string, Set<string>>> {
  if (eventIds.length === 0) return new Map();
  const rows: { eventId: string; userId: string }[] = await db
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
  const pastEvents = (await listEvents(db, { when: "past" })).filter((e) => !e.cancelled);
  if (pastEvents.length === 0) return { upcoming, season: { done: 0, neverConfirmed: 0 }, last: [] };
  const eventById = new Map(pastEvents.map((e) => [e.id, e]));
  const rows: { id: string; eventId: string; equipmentUnitId: string; direction: "to" | "from"; confirmedAt: Date | null }[] = await db
    .select({ id: duty.id, eventId: duty.eventId, equipmentUnitId: duty.equipmentUnitId, direction: duty.direction, confirmedAt: duty.confirmedAt })
    .from(duty)
    .innerJoin(dutyUser, eq(dutyUser.dutyId, duty.id))
    .where(and(eq(dutyUser.userId, userId), inArray(duty.eventId, pastEvents.map((e) => e.id)), isNull(duty.voidedAt)));
  const records: PastDutyRecord[] = rows
    .map((r) => {
      const event = eventById.get(r.eventId);
      return event
        ? {
            dutyId: r.id,
            direction: r.direction,
            confirmedAt: r.confirmedAt,
            equipmentUnitId: r.equipmentUnitId,
            event: { id: event.id, title: event.title, end: event.end },
          }
        : undefined;
    })
    .filter((r): r is PastDutyRecord => !!r);
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
  const events = (await listEvents(db, { when: "upcoming" })).filter((e) => !e.cancelled);
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
  const checklistsByEvent = await resolveChecklistsForEvents(db, events);
  const itemsOf = (eventId: string) => checklistsByEvent.get(eventId)?.items ?? [];
  const inScope: Set<string> | undefined = !scope
    ? undefined
    : "equipmentUnitId" in scope
      ? new Set([scope.equipmentUnitId])
      : new Set(itemsOf(scope.eventId).map((i) => i.equipmentUnitId));
  const wanted = inScope ? equipment.filter((k) => inScope.has(k.id)) : equipment;
  const [userIdsByDuty, portions] = await Promise.all([
    loadUserIdsFor(db, dutyRows.filter((d) => !inScope || inScope.has(d.equipmentUnitId)).map((r) => r.id)),
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
      .map((d) => ({ equipmentUnitId: d.equipmentUnitId, direction: d.direction, userIds: userIdsByDuty.get(d.id) ?? [] })),
    }))
    .filter((e) => !inScope || e.items.length > 0);
  const portionsByUnit = new Map<string, typeof portions>();
  for (const p of portions) portionsByUnit.set(p.equipmentUnitId, [...(portionsByUnit.get(p.equipmentUnitId) ?? []), p]);
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

/** Clash warnings across all upcoming, uncancelled Events. */
export async function listClashes(db: Db): Promise<Clash[]> {
  return findClashes(await loadPlan(db));
}

/** Heads-ups across all upcoming, uncancelled Events. */
export async function listHeadsUps(db: Db, now: Date = new Date()): Promise<HeadsUp[]> {
  return (await listPlanWarnings(db, now)).headsUps;
}

/** Clashes and heads-ups together, from one load of the equipment plan. */
export async function listPlanWarnings(
  db: Db,
  now: Date = new Date(),
  scope?: PlanScope,
): Promise<{ clashes: Clash[]; headsUps: HeadsUp[] }> {
  const [plan, people] = await Promise.all([loadPlan(db, scope), listKnownUsers(db)]);
  const names = new Map(people.map((p) => [p.id, displayName(p)]));
  return {
    clashes: findClashes(plan),
    headsUps: findHeadsUps({ now, ...plan, personName: (id) => names.get(id) ?? "Someone" }),
  };
}

/** A shared Duty reads as everyone's: "Tom & Sam" for the Equipment Unit's plain description. */
export function dutyPeopleLabel(userIds: string[], personName: (id: string) => string): string {
  return joinNames(userIds.map(personName));
}
