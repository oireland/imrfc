import { and, eq, inArray, isNull } from "drizzle-orm";
import { resolveEventChecklist } from "@/features/checklists";
import { getEvent, listEvents } from "@/features/events";
import {
  getKitUnit,
  getPortions,
  listKitUnits,
  recordSplitMove,
  setUnconfirmed,
} from "@/features/kit";
import { displayName, isCommitteeOrAbove, listApprovedUsers, type Role } from "@/features/users";
import { findClashes, type Clash } from "./clashes-rules";
import { gatherConfirmSources, gatherFromDutyUsers, validateHolderSplit, type HolderPart, type SourcePart } from "./confirm-source-rules";
import { dutyActions, type DutyAction } from "./duty-actions-rules";
import { findHeadsUps, type HeadsUp } from "./heads-up-rules";
import { joinNames } from "./names-rules";
import type { PlanEvent, PlanKit } from "./plan";
import { duty, dutyUser } from "./schema";

export { duty } from "./schema";
export type { Clash } from "./clashes-rules";
export type { HeadsUp } from "./heads-up-rules";
export { formatDutySummary } from "./duty-summary-rules";
export { dutyActions } from "./duty-actions-rules";
export type { DutyAction } from "./duty-actions-rules";
export { joinNames } from "./names-rules";
export { gatherConfirmSources, needsSourceChoice } from "./confirm-source-rules";
export type { HolderPart, SourcePart } from "./confirm-source-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

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

/** The sibling From Duty for a To Duty (same Event, same Kit Unit), if any. */
async function siblingFromDuty(db: Db, toRow: typeof duty.$inferSelect): Promise<typeof duty.$inferSelect | undefined> {
  if (toRow.direction !== "to") return undefined;
  const [row] = await db
    .select()
    .from(duty)
    .where(and(eq(duty.eventId, toRow.eventId), eq(duty.kitUnitId, toRow.kitUnitId), eq(duty.direction, "from")));
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

/** Makes sure each Kit Unit on the Event's Checklist has its To and From Duty, and returns them. */
export async function ensureDuties(db: Db, eventId: string, kitUnitIds: string[]): Promise<Duty[]> {
  if (kitUnitIds.length === 0) return [];
  await db
    .insert(duty)
    .values(
      kitUnitIds.flatMap((kitUnitId) =>
        (["to", "from"] as const).map((direction) => ({
          id: crypto.randomUUID(),
          eventId,
          kitUnitId,
          direction,
        })),
      ),
    )
    .onConflictDoNothing();
  const rows: (typeof duty.$inferSelect)[] = await db
    .select()
    .from(duty)
    .where(and(eq(duty.eventId, eventId), inArray(duty.kitUnitId, kitUnitIds)));
  const userIdsByDuty = await loadUserIdsFor(db, rows.map((r) => r.id));
  return rows.map((r) => toDuty(r, userIdsByDuty.get(r.id) ?? []));
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
  for (const id of current.filter((id) => !userIds.includes(id))) await removeUser(db, row, id);
  for (const id of userIds.filter((id) => !current.includes(id))) await addUser(db, row, id);
  return { ok: true };
}

/** A User hands their own place on a Duty to someone else. */
export async function handOnDuty(db: Db, dutyId: string, actorId: string, toUserId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  const ids = await userIdsOf(db, dutyId);
  if (!ids.includes(actorId)) return { ok: false, error: "You can only hand on your own place." };
  if (ids.includes(toUserId)) return { ok: false, error: "They're already on it." };
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

/** The Checklist line's effective count for this Duty's Event and Kit Unit, capped at `fallbackQuantity`. */
async function checklistCountFor(
  db: Db,
  dutyRow: { eventId: string; kitUnitId: string },
  fallbackQuantity: number,
): Promise<number> {
  const event = await getEvent(db, dutyRow.eventId);
  if (!event) return fallbackQuantity;
  const resolved = await resolveEventChecklist(db, {
    eventId: dutyRow.eventId,
    seriesId: event.seriesId,
    eventType: event.eventType,
  });
  return resolved.items.find((i) => i.kitUnitId === dutyRow.kitUnitId)?.count ?? fallbackQuantity;
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
 * the Checklist line's effective count (not necessarily the Kit Unit's whole
 * Quantity). A To Duty's count is gathered from a source Place (or several — see
 * `gatherConfirmSources`), defaulted unless the confirm sheet gives one. A From Duty's
 * count always comes from the Duty's own People. When the Duty has several People and
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

  const kit = await getKitUnit(db, row.kitUnitId);
  if (!kit) return { ok: false, error: "That kit no longer exists." };

  const count = await checklistCountFor(db, row, kit.quantity);
  const portions = await getPortions(db, row.kitUnitId);

  await db.update(duty).set({ confirmedAt: new Date() }).where(eq(duty.id, dutyId));

  if (row.direction === "to") {
    const holderSplit = resolveHolderSplit(userIds, count, actor.id, options?.holders);
    if (!holderSplit.ok) return holderSplit;
    const parts = options?.from ?? gatherConfirmSources(portions, { dutyUserIds: userIds, homeStoreId: kit.homeId, count }).sources;
    return recordSplitMove(db, kit.id, actor.id, "duty", {
      sources: toSources(parts),
      targets: holderSplit.parts.map((p) => ({ to: { type: "holder", holderId: p.userId } as const, count: p.count })),
    });
  }

  const parts = gatherFromDutyUsers(portions, { userIds, count }).sources;
  if (row.destinationType === "holder") {
    const holderSplit = resolveHolderSplit(userIds, count, actor.id, options?.holders);
    if (!holderSplit.ok) return holderSplit;
    return recordSplitMove(db, kit.id, actor.id, "duty", {
      sources: toSources(parts),
      targets: holderSplit.parts.map((p) => ({ to: { type: "holder", holderId: p.userId } as const, count: p.count })),
    });
  }
  const storeId = row.destinationType === "store" && row.destinationStoreId ? row.destinationStoreId : kit.homeId;
  return recordSplitMove(db, kit.id, actor.id, "duty", { sources: toSources(parts), targets: [{ to: { type: "store", storeId }, count }] });
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

export async function voidDutiesForEvent(db: Db, eventId: string) {
  await db.update(duty).set({ voidedAt: new Date() }).where(eq(duty.eventId, eventId));
}

/**
 * Once an Event has ended, a Kit Unit still held by the To Duty's People whose From
 * Duty wasn't Confirmed becomes Unconfirmed — up to the Checklist line's count, taken
 * from whichever of them hold it (in order). The app never assumes a Move happened.
 */
export async function markUnconfirmed(db: Db) {
  const ended = (await listEvents(db, { when: "past" })).filter((e) => !e.cancelled).map((e) => e.id);
  if (ended.length === 0) return;
  const rows: (typeof duty.$inferSelect)[] = await db
    .select()
    .from(duty)
    .where(and(inArray(duty.eventId, ended), isNull(duty.voidedAt)));
  const userIdsByDuty = await loadUserIdsFor(db, rows.map((r) => r.id));
  for (const from of rows.filter((d) => d.direction === "from" && !d.confirmedAt)) {
    const to = rows.find((d) => d.direction === "to" && d.eventId === from.eventId && d.kitUnitId === from.kitUnitId);
    const toUserIds = to ? (userIdsByDuty.get(to.id) ?? []) : [];
    if (!to?.confirmedAt || toUserIds.length === 0) continue;
    const kit = await getKitUnit(db, from.kitUnitId);
    if (!kit) continue;
    const count = await checklistCountFor(db, from, kit.quantity);
    const portions = await getPortions(db, kit.id);
    const held = gatherFromDutyUsers(portions, { userIds: toUserIds, count });
    for (const source of held.sources) {
      await setUnconfirmed(db, kit.id, from.eventId, source.place, source.count);
    }
  }
}

/** A Blocked User is removed from their Duties on upcoming, unconfirmed Events. */
export async function releaseDutiesOfBlockedUser(db: Db, userId: string) {
  const upcoming = (await listEvents(db, { when: "upcoming" })).map((e) => e.id);
  if (upcoming.length === 0) return;
  const rows: (typeof duty.$inferSelect)[] = await db
    .select()
    .from(duty)
    .where(and(inArray(duty.eventId, upcoming), isNull(duty.confirmedAt)));
  for (const row of rows) {
    const ids = await userIdsOf(db, row.id);
    if (ids.includes(userId)) await removeUser(db, row, userId);
  }
}

/** The User's Duties still to do on upcoming, uncancelled Events, soonest Event first. */
export async function listUpcomingDutiesForUser(db: Db, userId: string) {
  const events = (await listEvents(db, { when: "upcoming" })).filter((e) => !e.cancelled);
  if (events.length === 0) return [];
  const rows: (typeof duty.$inferSelect & { userId: string })[] = await db
    .select({
      id: duty.id,
      eventId: duty.eventId,
      kitUnitId: duty.kitUnitId,
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
  const userIdsByDuty = await loadUserIdsFor(db, rows.map((r) => r.id));
  const results = await Promise.all(
    events.flatMap((event) =>
      rows
        .filter((r) => r.eventId === event.id)
        .map(async (r) => ({
          duty: toDuty(r, userIdsByDuty.get(r.id) ?? []),
          event,
          count: await checklistCountFor(db, r, (await getKitUnit(db, r.kitUnitId))?.quantity ?? 1),
        })),
    ),
  );
  return results;
}

/** The kit plan for every upcoming, uncancelled Event. Read-only: it never creates Duties. */
async function loadPlan(db: Db): Promise<{ kit: PlanKit[]; events: PlanEvent[] }> {
  const events = (await listEvents(db, { when: "upcoming" })).filter((e) => !e.cancelled);
  if (events.length === 0) return { kit: [], events: [] };
  const [kit, dutyRows] = await Promise.all([
    listKitUnits(db, { includeRetired: true }),
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
  const userIdsByDuty = await loadUserIdsFor(db, dutyRows.map((r) => r.id));
  const planEvents: PlanEvent[] = await Promise.all(
    events.map(async (e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      items: (await resolveEventChecklist(db, { eventId: e.id, seriesId: e.seriesId, eventType: e.eventType })).items,
      duties: dutyRows
        .filter((d) => d.eventId === e.id)
        .map((d) => ({ kitUnitId: d.kitUnitId, direction: d.direction, userIds: userIdsByDuty.get(d.id) ?? [] })),
    })),
  );
  const portionsByUnit = new Map<string, Awaited<ReturnType<typeof getPortions>>>();
  await Promise.all(
    kit.map(async (k) => {
      portionsByUnit.set(k.id, await getPortions(db, k.id));
    }),
  );
  return {
    kit: kit.map((k) => ({
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
  const [plan, people] = await Promise.all([loadPlan(db), listApprovedUsers(db)]);
  const names = new Map(people.map((p) => [p.id, displayName(p)]));
  return findHeadsUps({ now, ...plan, personName: (id) => names.get(id) ?? "Someone" });
}

/** A shared Duty reads as everyone's: "Tom & Sam" for the Kit Unit's plain description. */
export function dutyPeopleLabel(userIds: string[], personName: (id: string) => string): string {
  return joinNames(userIds.map(personName));
}
