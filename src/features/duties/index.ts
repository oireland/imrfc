import { and, eq, inArray, isNull } from "drizzle-orm";
import { resolveEventChecklist } from "@/features/checklists";
import { listEvents } from "@/features/events";
import { getKitUnit, listKitUnits, recordMove, setUnconfirmed } from "@/features/kit";
import { isCommitteeOrAbove, type Role } from "@/features/users";
import { findClashes, type Clash, type ClashEvent } from "./clashes-rules";
import { duty } from "./schema";

export { duty } from "./schema";
export type { Clash } from "./clashes-rules";

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
  if (!row) return { ok: false, error: "Duty not found." };
  if (row.userId) return { ok: false, error: "That Duty is already taken." };
  await fill(db, row, userId);
  return { ok: true };
}

/** Committee fills a Duty with a named User, replacing whoever held it. */
export async function assignDuty(db: Db, dutyId: string, userId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "Duty not found." };
  await fill(db, row, userId);
  return { ok: true };
}

export async function unassignDuty(db: Db, dutyId: string) {
  await db.update(duty).set({ userId: null }).where(eq(duty.id, dutyId));
}

/** A User passes their own Duty to someone else. */
export async function handOnDuty(db: Db, dutyId: string, actorId: string, toUserId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "Duty not found." };
  if (row.userId !== actorId) return { ok: false, error: "You can only hand on your own Duty." };
  await db.update(duty).set({ userId: toUserId }).where(eq(duty.id, dutyId));
  return { ok: true };
}

export async function setDestination(db: Db, dutyId: string, destination: DutyDestination): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "Duty not found." };
  if (row.direction !== "from") return { ok: false, error: "Only a From Duty has a Destination." };
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
  if (!row) return { ok: false, error: "Duty not found." };
  if (row.voidedAt) return { ok: false, error: "That Duty was voided when its Event was Cancelled." };
  if (!row.userId) return { ok: false, error: "That Duty has nobody on it yet." };
  if (row.confirmedAt) return { ok: false, error: "That Duty is already Confirmed." };
  if (row.userId !== actor.id && !isCommitteeOrAbove(actor.role)) {
    return { ok: false, error: "Only the Duty's User or Committee can Confirm it." };
  }

  const kit = await getKitUnit(db, row.kitUnitId);
  if (!kit) return { ok: false, error: "Kit Unit not found." };

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
    if (kit?.whereaboutsType === "holder" && kit.holderId === to.userId) {
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

/** Clash warnings across all upcoming, uncancelled Events. Read-only: it never creates Duties. */
export async function listClashes(db: Db, now: Date = new Date()): Promise<Clash[]> {
  const events = (await listEvents(db, { when: "upcoming" })).filter((e) => !e.cancelled);
  if (events.length === 0) return [];
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
  const clashEvents: ClashEvent[] = await Promise.all(
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
  return findClashes({
    now,
    kit: kit.map((k) => ({
      id: k.id,
      name: k.name,
      status: k.status,
      holderId: k.whereaboutsType === "holder" ? k.holderId : null,
    })),
    events: clashEvents,
  });
}
