import { and, eq, inArray } from "drizzle-orm";
import { getAvailability } from "@/features/availability";
import { getEvent, getEvents, listEventsBetween, londonParts, londonToUtc, startsAt, type Event, type EventWithDetails } from "@/features/events";
import { listPlayers } from "@/features/players";
import { displayName, listKnownUsers, type RugbyPosition } from "@/features/users";
import { DEFAULT_SHIRTS, fitFor, positionOfShirt, type Candidate, type Fit } from "./shirts";
import { selectionNotice, selectionPitch, selectionSent, selectionShirt, teamNaming } from "./schema";
import type { Role } from "./sheet";

export { DEFAULT_SHIRTS, fitFor, positionOfShirt, sortForShirt, STARTING_SHIRTS } from "./shirts";
export type { Candidate, Fit } from "./shirts";
export * from "./team-sheet";
export * from "./naming";
export { ROLES, ROLE_NAMES, SINGLE_ROLES, buildSheet, missingFromSheet, rolesText } from "./sheet";
export type { Role, SheetFields, SheetLayout } from "./sheet";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type Viewer = { id: string; committee: boolean };
type Result = { ok: true } | { ok: false; error: string };
type ShirtRef = { eventId: string; shirt: number };

export type Replied = "available" | "not_available" | "no_reply";

export type Occupant =
  | { kind: "player"; userId: string; name: string; fit: Fit; availability: Replied }
  | { kind: "guest"; name: string };

export type ShirtView = {
  shirt: number;
  position: RugbyPosition | null;
  occupant: Occupant | null;
  /** Match Day Roles of whoever is on this Shirt, in the order a sheet prints them. */
  roles: Role[];
  /** Who last changed this Shirt, and when, for the "Tom moved this" flash. */
  changedBy: string | null;
  changedAt: Date | null;
};

export type Pitch = {
  eventId: string;
  /** The Team's name ("1st XV"), or the Event's title when it has none. */
  label: string;
  title: string;
  start: Date;
  readOnly: boolean;
  shirts: ShirtView[];
};

export type BoardCandidate = Candidate & { availability: Replied };

export type Board = { pitches: Pitch[]; candidates: BoardCandidate[] };

const labelOf = (e: { title: string; teams?: { name: string }[] }) => e.teams?.[0]?.name ?? e.title;

/** Every Match on the London day of `event`, soonest first, with their Teams. */
async function matchDay(db: Db, event: Event): Promise<EventWithDetails[]> {
  const dayStart = londonToUtc(londonParts(event.start).date, "00:00");
  const sameDay: Event[] = await listEventsBetween(db, dayStart, new Date(dayStart.getTime() + 26 * 3_600_000));
  const day = new Set(
    sameDay.filter((e) => e.eventType === "match" && londonParts(e.start).date === londonParts(event.start).date).map((e) => e.id),
  );
  day.add(event.id);
  return (await getEvents(db, [...day])).sort((a, b) => a.start.getTime() - b.start.getTime());
}

const isReadOnly = (e: Event, now: Date) => e.cancelled || startsAt(e) <= now;

async function pitchSizes(db: Db, eventIds: string[]): Promise<Map<string, number>> {
  const rows = await db.select().from(selectionPitch).where(inArray(selectionPitch.eventId, eventIds));
  return new Map(rows.map((r: { eventId: string; shirtCount: number }) => [r.eventId, r.shirtCount]));
}

/** The shared Selection board for the match day of `eventId`, for Committee; null for anyone else or a non-Match. */
export async function getBoard(db: Db, eventId: string, viewer: Viewer, now: Date = new Date()): Promise<Board | null> {
  if (!viewer.committee) return null;
  const event = await getEvent(db, eventId);
  if (!event || event.eventType !== "match") return null;

  const events = await matchDay(db, event);
  const ids = events.map((e) => e.id);
  const [rows, sizes, people, listing, availability] = await Promise.all([
    db.select().from(selectionShirt).where(inArray(selectionShirt.eventId, ids)),
    pitchSizes(db, ids),
    listKnownUsers(db),
    listPlayers(db),
    getAvailability(db, eventId, viewer, now),
  ]);

  const names = new Map<string, string>(people.map((u: Parameters<typeof displayName>[0] & { id: string }) => [u.id, displayName(u)]));
  const replied = new Map<string, Replied>();
  for (const r of availability.summary.available) replied.set(r.userId, "available");
  for (const r of availability.summary.notAvailable) replied.set(r.userId, "not_available");
  const candidates: BoardCandidate[] = listing.playing.map((p) => {
    const person = people.find((u: { id: string }) => u.id === p.id);
    return {
      id: p.id,
      name: p.name,
      preferredPosition: p.preferredPosition,
      otherPositions: (person?.otherPositions ?? []) as RugbyPosition[],
      availability: replied.get(p.id) ?? "no_reply",
    };
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const pitches: Pitch[] = events.map((e) => {
    const mine = (rows as (typeof selectionShirt.$inferSelect)[]).filter((r) => r.eventId === e.id);
    const count = sizes.get(e.id) ?? DEFAULT_SHIRTS;
    const shirts: ShirtView[] = Array.from({ length: count }, (_, i) => {
      const shirt = i + 1;
      const row = mine.find((r) => r.shirt === shirt);
      let occupant: Occupant | null = null;
      if (row?.userId) {
        const candidate = byId.get(row.userId);
        occupant = {
          kind: "player",
          userId: row.userId,
          name: names.get(row.userId) ?? "Someone",
          fit: candidate ? fitFor(shirt, candidate) : "rest",
          availability: candidate?.availability ?? "no_reply",
        };
      } else if (row?.guestName) {
        occupant = { kind: "guest", name: row.guestName };
      }
      return {
        shirt,
        position: positionOfShirt(shirt),
        occupant,
        roles: (row?.roles ?? []) as Role[],
        changedBy: row ? (names.get(row.updatedById) ?? "Someone") : null,
        changedAt: row?.updatedAt ?? null,
      };
    });
    return { eventId: e.id, label: labelOf(e), title: e.title, start: e.start, readOnly: isReadOnly(e, now), shirts };
  });

  return { pitches, candidates };
}

/** Why `viewer` can't change this Shirt, or the Match it's on; null when they can. */
async function refuse(db: Db, ref: ShirtRef, viewer: Viewer, now: Date): Promise<{ ok: false; error: string } | null> {
  if (!viewer.committee) return { ok: false, error: "Only committee can pick the team." };
  const event = await getEvent(db, ref.eventId);
  if (!event || event.eventType !== "match") return { ok: false, error: "That match doesn't exist." };
  if (event.cancelled) return { ok: false, error: "This match is cancelled." };
  if (startsAt(event) <= now) return { ok: false, error: "This match has already started." };
  const count = (await pitchSizes(db, [ref.eventId])).get(ref.eventId) ?? DEFAULT_SHIRTS;
  if (!Number.isInteger(ref.shirt) || ref.shirt < 1 || ref.shirt > count) return { ok: false, error: `There's no shirt ${ref.shirt}.` };
  return null;
}

async function fill(db: Db, ref: ShirtRef, who: { userId: string | null; guestName: string | null; roles?: string[] }, viewer: Viewer, now: Date) {
  const values = { roles: [], ...who, updatedById: viewer.id, updatedAt: now };
  await db
    .insert(selectionShirt)
    .values({ eventId: ref.eventId, shirt: ref.shirt, ...values })
    .onConflictDoUpdate({ target: [selectionShirt.eventId, selectionShirt.shirt], set: values });
}

const empty = (db: Db, ref: ShirtRef) =>
  db.delete(selectionShirt).where(and(eq(selectionShirt.eventId, ref.eventId), eq(selectionShirt.shirt, ref.shirt)));

/**
 * Puts a Player on a Shirt, replacing whoever was there. A Player already on a Shirt that
 * match day moves, leaving the old one empty; `movedFrom` says where they came from.
 */
export async function pickPlayer(
  db: Db,
  input: ShirtRef & { userId: string; viewer: Viewer },
  now: Date = new Date(),
): Promise<{ ok: true; movedFrom?: string } | { ok: false; error: string }> {
  const denied = await refuse(db, input, input.viewer, now);
  if (denied) return denied;
  const players = (await listPlayers(db)).playing;
  if (!players.some((p) => p.id === input.userId)) return { ok: false, error: "That player isn't playing." };

  const event = (await getEvent(db, input.eventId))!;
  const day = await matchDay(db, event);
  const existing: (typeof selectionShirt.$inferSelect)[] = await db
    .select()
    .from(selectionShirt)
    .where(and(inArray(selectionShirt.eventId, day.map((e) => e.id)), eq(selectionShirt.userId, input.userId)));

  let movedFrom: string | undefined;
  for (const old of existing) {
    if (old.eventId === input.eventId && old.shirt === input.shirt) continue;
    await empty(db, old);
    movedFrom = `${labelOf(day.find((e) => e.id === old.eventId)!)} ${old.shirt}`;
  }
  await fill(db, input, { userId: input.userId, guestName: null }, input.viewer, now);
  return movedFrom ? { ok: true, movedFrom } : { ok: true };
}

/** Types a Guest's name onto a Shirt, replacing whoever was there. */
export async function pickGuest(db: Db, input: ShirtRef & { name: string; viewer: Viewer }, now: Date = new Date()): Promise<Result> {
  const denied = await refuse(db, input, input.viewer, now);
  if (denied) return denied;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Type the guest's name." };
  await fill(db, input, { userId: null, guestName: name }, input.viewer, now);
  return { ok: true };
}

/** Empties a Shirt. */
export async function clearShirt(db: Db, input: ShirtRef & { viewer: Viewer }, now: Date = new Date()): Promise<Result> {
  const denied = await refuse(db, input, input.viewer, now);
  if (denied) return denied;
  await empty(db, input);
  return { ok: true };
}

async function occupantRow(db: Db, ref: ShirtRef) {
  const [row] = await db
    .select()
    .from(selectionShirt)
    .where(and(eq(selectionShirt.eventId, ref.eventId), eq(selectionShirt.shirt, ref.shirt)));
  return row as typeof selectionShirt.$inferSelect | undefined;
}

/** Swaps what's on two Shirts, on the same pitch or across pitches; an empty Shirt just receives. */
export async function swapShirts(db: Db, input: { from: ShirtRef; to: ShirtRef; viewer: Viewer }, now: Date = new Date()): Promise<Result> {
  for (const ref of [input.from, input.to]) {
    const denied = await refuse(db, ref, input.viewer, now);
    if (denied) return denied;
  }
  const [a, b] = await Promise.all([occupantRow(db, input.from), occupantRow(db, input.to)]);
  const asWho = (row?: typeof selectionShirt.$inferSelect) => (row ? { userId: row.userId, guestName: row.guestName, roles: row.roles } : null);
  const [whoA, whoB] = [asWho(a), asWho(b)];
  await db.transaction(async (tx: Db) => {
    if (whoB) await fill(tx, input.from, whoB, input.viewer, now);
    else await empty(tx, input.from);
    if (whoA) await fill(tx, input.to, whoA, input.viewer, now);
    else await empty(tx, input.to);
  });
  return { ok: true };
}

/** Adds the next Shirt (24, 25…) to one Match's pitch. */
export async function addShirt(db: Db, input: { eventId: string; viewer: Viewer }, now: Date = new Date()): Promise<Result> {
  const denied = await refuse(db, { eventId: input.eventId, shirt: 1 }, input.viewer, now);
  if (denied) return denied;
  const count = (await pitchSizes(db, [input.eventId])).get(input.eventId) ?? DEFAULT_SHIRTS;
  await db
    .insert(selectionPitch)
    .values({ eventId: input.eventId, shirtCount: count + 1 })
    .onConflictDoUpdate({ target: selectionPitch.eventId, set: { shirtCount: count + 1 } });
  return { ok: true };
}

/** Takes away the last extra Shirt, if it's empty. */
export async function removeShirt(db: Db, input: { eventId: string; viewer: Viewer }, now: Date = new Date()): Promise<Result> {
  const denied = await refuse(db, { eventId: input.eventId, shirt: 1 }, input.viewer, now);
  if (denied) return denied;
  const count = (await pitchSizes(db, [input.eventId])).get(input.eventId) ?? DEFAULT_SHIRTS;
  if (count <= DEFAULT_SHIRTS) return { ok: false, error: `A team always has ${DEFAULT_SHIRTS} shirts.` };
  if (await occupantRow(db, { eventId: input.eventId, shirt: count })) return { ok: false, error: `Empty shirt ${count} first.` };
  await db.update(selectionPitch).set({ shirtCount: count - 1 }).where(eq(selectionPitch.eventId, input.eventId));
  return { ok: true };
}

/** The Players (not Guests) on a Match's Shirts right now. */
export async function listPickedPlayerIds(db: Db, eventId: string): Promise<string[]> {
  const rows: { userId: string | null }[] = await db.select({ userId: selectionShirt.userId }).from(selectionShirt).where(eq(selectionShirt.eventId, eventId));
  return rows.flatMap((r) => (r.userId ? [r.userId] : []));
}

/** Removes everything picked, named and sent for a deleted Event. */
export async function deleteSelectionForEvent(db: Db, eventId: string) {
  await db.delete(selectionShirt).where(eq(selectionShirt.eventId, eventId));
  await db.delete(selectionPitch).where(eq(selectionPitch.eventId, eventId));
  await db.delete(selectionSent).where(eq(selectionSent.eventId, eventId));
  await db.delete(selectionNotice).where(eq(selectionNotice.eventId, eventId));
  await db.delete(teamNaming).where(eq(teamNaming.eventId, eventId));
}
