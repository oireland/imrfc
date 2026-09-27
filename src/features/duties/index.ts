import { and, eq, inArray, isNull } from "drizzle-orm";
import { resolveEventChecklist } from "@/features/checklists";
import { listEvents } from "@/features/events";
import { getKitUnit, getPortions, listKitUnits, recordMove, setUnconfirmed, singlePlace } from "@/features/kit";
import { displayName, isCommitteeOrAbove, listApprovedUsers, type Role } from "@/features/users";
import { findClashes, type Clash } from "./clashes-rules";
import { dutyActions, type DutyAction } from "./duty-actions-rules";
import { findHeadsUps, type HeadsUp } from "./heads-up-rules";
import type { PlanEvent, PlanKit } from "./plan";
import { duty } from "./schema";

export { duty } from "./schema";
export type { Clash } from "./clashes-rules";
export type { HeadsUp } from "./heads-up-rules";
export { formatDutySummary } from "./duty-summary-rules";
export { dutyActions } from "./duty-actions-rules";
export type { DutyAction } from "./duty-actions-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type DutyDestination = { type: "home" } | { type: "store"; storeId: string } | { type: "holder" };
export type Duty = Omit<typeof duty.$inferSelect, "destinationType" | "destinationStoreId"> & {
  destination: DutyDestination;
};
type Result = { ok: true } | { ok: false; error: string };

function toDuty(row: typeof duty.$inferSelect): Duty {
  const { destinationType, destinationStoreId, ...rest } = row;
  const destination: DutyDestination =
    destinationType === "store" && destinationStoreId
      ? { type: "store", storeId: destinationStoreId }
      : destinationType === "holder"
        ? { type: "holder" }
        : { type: "home" };
  return { ...rest, destination };
}

async function getDuty(db: Db, id: string): Promise<typeof duty.$inferSelect | undefined> {
  const [row] = await db.select().from(duty).where(eq(duty.id, id));
  return row;
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
  const rows = await db
    .select()
    .from(duty)
    .where(and(eq(duty.eventId, eventId), inArray(duty.kitUnitId, kitUnitIds)));
  return rows.map(toDuty);
}

/** Fills a Duty; a To Duty also pulls its still-unfilled From Duty along to the same User. */
async function fill(db: Db, row: typeof duty.$inferSelect, userId: string) {
  await db.update(duty).set({ userId }).where(eq(duty.id, row.id));
  if (row.direction === "to") {
    await db
      .update(duty)
      .set({ userId })
      .where(
        and(
          eq(duty.eventId, row.eventId),
          eq(duty.kitUnitId, row.kitUnitId),
          eq(duty.direction, "from"),
          isNull(duty.userId),
        ),
      );
  }
}

/** Any User takes an unfilled Duty for themselves. */
export async function claimDuty(db: Db, dutyId: string, userId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  if (row.userId) return { ok: false, error: "Someone is already doing that." };
  await fill(db, row, userId);
  return { ok: true };
}

/** Committee fills a Duty with a named User, replacing whoever held it. */
export async function assignDuty(db: Db, dutyId: string, userId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  await fill(db, row, userId);
  return { ok: true };
}

export async function unassignDuty(db: Db, dutyId: string) {
  await db.update(duty).set({ userId: null }).where(eq(duty.id, dutyId));
}

/** A User passes their own Duty to someone else. */
export async function handOnDuty(db: Db, dutyId: string, actorId: string, toUserId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  if (row.userId !== actorId) return { ok: false, error: "You can only hand on your own duties." };
  await db.update(duty).set({ userId: toUserId }).where(eq(duty.id, dutyId));
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

/** The Duty's User, or any Committee member, Confirms a Duty: this records the Move. */
export async function confirmDuty(db: Db, dutyId: string, actor: { id: string; role: Role }): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "That duty no longer exists." };
  if (row.voidedAt) return { ok: false, error: "That event was cancelled, so there's nothing to do." };
  if (!row.userId) return { ok: false, error: "Nobody is doing that yet." };
  if (row.confirmedAt) return { ok: false, error: "That's already confirmed." };
  if (row.userId !== actor.id && !isCommitteeOrAbove(actor.role)) {
    return { ok: false, error: "Only the person doing it or the committee can confirm it." };
  }

  const kit = await getKitUnit(db, row.kitUnitId);
  if (!kit) return { ok: false, error: "That kit no longer exists." };

  const holder = { type: "holder", holderId: row.userId } as const;
  const target =
    row.direction === "to"
      ? holder
      : row.destinationType === "holder"
        ? holder
        : row.destinationType === "store" && row.destinationStoreId
          ? ({ type: "store", storeId: row.destinationStoreId } as const)
          : ({ type: "store", storeId: kit.homeId } as const);

  await db.update(duty).set({ confirmedAt: new Date() }).where(eq(duty.id, dutyId));
  await recordMove(db, row.kitUnitId, actor.id, target, "duty");
  return { ok: true };
}

/** Cancelling an Event voids all its Duties. */
export type DutyRequest =
  | { action: "claim" }
  | { action: "confirm" }
  | { action: "handOn"; userId: string }
  | { action: "assign"; userId: string }
  | { action: "unassign" }
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
  const allowed: DutyAction[] = dutyActions(
    { direction: row.direction, userId: row.userId, confirmed: !!row.confirmedAt, voided: !!row.voidedAt },
    { viewerId: viewer.id, committee: isCommitteeOrAbove(viewer.role) },
  );
  if (!allowed.includes(request.action)) return { ok: false, error: "You can't do that on this duty." };
  switch (request.action) {
    case "claim":
      return claimDuty(db, dutyId, viewer.id);
    case "confirm": {
      const result = await confirmDuty(db, dutyId, viewer);
      if (result.ok) await markUnconfirmed(db);
      return result;
    }
    case "handOn":
      return handOnDuty(db, dutyId, viewer.id, request.userId);
    case "assign":
      return assignDuty(db, dutyId, request.userId);
    case "unassign":
      await unassignDuty(db, dutyId);
      return { ok: true };
    case "setDestination":
      return setDestination(db, dutyId, request.destination);
  }
}

export async function voidDutiesForEvent(db: Db, eventId: string) {
  await db.update(duty).set({ voidedAt: new Date() }).where(eq(duty.eventId, eventId));
}

/**
 * Once an Event has ended, a Kit Unit still held from its To Duty whose From Duty
 * wasn't Confirmed becomes Unconfirmed. The app never assumes a Move happened.
 */
export async function markUnconfirmed(db: Db) {
  const ended = (await listEvents(db, { when: "past" })).filter((e) => !e.cancelled).map((e) => e.id);
  if (ended.length === 0) return;
  const rows: (typeof duty.$inferSelect)[] = await db
    .select()
    .from(duty)
    .where(and(inArray(duty.eventId, ended), isNull(duty.voidedAt)));
  for (const from of rows.filter((d) => d.direction === "from" && !d.confirmedAt)) {
    const to = rows.find((d) => d.direction === "to" && d.eventId === from.eventId && d.kitUnitId === from.kitUnitId);
    if (!to?.confirmedAt || !to.userId) continue;
    const kit = await getKitUnit(db, from.kitUnitId);
    if (!kit) continue;
    const place = singlePlace(await getPortions(db, kit.id));
    if (place?.type === "holder" && place.holderId === to.userId) {
      await setUnconfirmed(db, kit.id, from.eventId);
    }
  }
}

/** A Blocked User's Duties on upcoming Events are unassigned, so Committee sees them as unfilled. */
export async function releaseDutiesOfBlockedUser(db: Db, userId: string) {
  const upcoming = (await listEvents(db, { when: "upcoming" })).map((e) => e.id);
  if (upcoming.length === 0) return;
  await db
    .update(duty)
    .set({ userId: null })
    .where(and(eq(duty.userId, userId), inArray(duty.eventId, upcoming), isNull(duty.confirmedAt)));
}

/** The User's Duties still to do on upcoming, uncancelled Events, soonest Event first. */
export async function listUpcomingDutiesForUser(db: Db, userId: string) {
  const events = (await listEvents(db, { when: "upcoming" })).filter((e) => !e.cancelled);
  if (events.length === 0) return [];
  const rows: (typeof duty.$inferSelect)[] = await db
    .select()
    .from(duty)
    .where(
      and(
        eq(duty.userId, userId),
        inArray(
          duty.eventId,
          events.map((e) => e.id),
        ),
        isNull(duty.confirmedAt),
        isNull(duty.voidedAt),
      ),
    );
  return events.flatMap((event) =>
    rows.filter((r) => r.eventId === event.id).map((r) => ({ duty: toDuty(r), event })),
  );
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
  const planEvents: PlanEvent[] = await Promise.all(
    events.map(async (e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      kitUnitIds: (await resolveEventChecklist(db, { eventId: e.id, seriesId: e.seriesId, eventType: e.eventType }))
        .kitUnitIds,
      duties: dutyRows.filter((d) => d.eventId === e.id),
    })),
  );
  const portionsByUnit = new Map<string, Awaited<ReturnType<typeof getPortions>>>();
  await Promise.all(
    kit.map(async (k) => {
      portionsByUnit.set(k.id, await getPortions(db, k.id));
    }),
  );
  return {
    kit: kit.map((k) => {
      const place = singlePlace(portionsByUnit.get(k.id) ?? []);
      return {
        id: k.id,
        name: k.name,
        status: k.status,
        holderId: place?.type === "holder" ? place.holderId : null,
      };
    }),
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
