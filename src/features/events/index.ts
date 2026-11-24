import type { Db } from "@/db/types";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { event, matchDetails, team } from "./schema";
import { eventTitle, validateEvent, type NewEvent } from "./rules";

export { event } from "./schema";
export { validateEvent, classifyEvent, eventTitle, trainingTitle, matchTitle, startsAt } from "./rules";
export {
  createSeries,
  editOccurrence,
  extendSeries,
  listOccurrences,
  listSeries,
  type NewSeries,
  type Occurrence,
  type OccurrenceChanges,
  type Series,
} from "./series";
export { buildQuickEvent, buildQuickSeries, type QuickEventInput } from "./quick-add";
export {
  EVENT_CSV_COLUMNS,
  MAX_EVENTS_PER_IMPORT,
  eventCsvTemplate,
  readEventsCsv,
  type EventCsvResult,
} from "./csv-import";
import { addDays, londonParts, londonToUtc } from "@/lib/time/london";
import type { Result } from "@/lib/result";
export type { EventType, HomeAway, Competition, NewEvent, NewMatchDetails } from "./rules";


export type Event = typeof event.$inferSelect;
export type MatchDetails = typeof matchDetails.$inferSelect;
export type Team = typeof team.$inferSelect;
export type EventWithDetails = Event & { matchDetails: MatchDetails | null; team: Team | null };

/** What a Match is called on a board or sheet: its Team's name, or the Event's title when it has none. */
export const matchLabel = (e: { title: string; team: Team | null }): string => e.team?.name ?? e.title;

export function listTeams(db: Db): Promise<Team[]> {
  return db.select().from(team).orderBy(asc(team.name));
}

export async function createEvent(
  db: Db,
  input: NewEvent,
): Promise<Result<{ event: Event }>> {
  const result = validateEvent(input);
  if (!result.ok) return result;
  const title = await titleFor(db, input);
  if (!title.ok) return title;
  return { ok: true, event: await db.transaction((tx) => insertEvent(tx, input, title.title)) };
}

/** The Event's derived title; a Match's needs its Team's name, so an unknown Team is an error. */
async function titleFor(db: Db, input: NewEvent): Promise<Result<{ title: string }>> {
  if (input.eventType !== "match") return { ok: true, title: eventTitle(input) };
  const [row] = await db.select().from(team).where(eq(team.id, input.matchDetails.teamId));
  if (!row) return { ok: false, error: "That team doesn't exist." };
  return { ok: true, title: eventTitle(input, row.name) };
}

/**
 * Creates many Events at once (a CSV import). All or nothing: if any one is
 * invalid or fails to save, none are created.
 */
export async function createEvents(
  db: Db,
  inputs: NewEvent[],
): Promise<Result<{ count: number }>> {
  for (const input of inputs) {
    const result = validateEvent(input);
    if (!result.ok) return { ok: false, error: `"${eventTitle(input)}": ${result.error}` };
  }
  const teamIds = [...new Set(inputs.flatMap((i) => (i.eventType === "match" ? [i.matchDetails.teamId] : [])))];
  const teams = new Map(
    teamIds.length ? (await db.select().from(team).where(inArray(team.id, teamIds))).map((t) => [t.id, t.name]) : [],
  );
  const rows: { input: NewEvent; row: ReturnType<typeof eventRow> }[] = [];
  for (const input of inputs) {
    let title = eventTitle(input);
    if (input.eventType === "match") {
      const name = teams.get(input.matchDetails.teamId);
      if (name === undefined) return { ok: false, error: "That team doesn't exist." };
      title = eventTitle(input, name);
    }
    rows.push({ input, row: eventRow(input, title, crypto.randomUUID()) });
  }
  if (rows.length === 0) return { ok: true, count: 0 };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(event).values(rows.map((r) => r.row));
      const matches = rows.flatMap(({ input, row }) =>
        input.eventType === "match" ? [{ eventId: row.id, ...matchRow(input.matchDetails) }] : [],
      );
      if (matches.length) await tx.insert(matchDetails).values(matches);
    });
  } catch {
    return { ok: false, error: "Couldn't save the events, so none were added." };
  }
  return { ok: true, count: inputs.length };
}

function matchRow(details: Extract<NewEvent, { eventType: "match" }>["matchDetails"]) {
  return {
    teamId: details.teamId,
    opponent: details.opponent.trim(),
    homeAway: details.homeAway,
    competition: details.competition,
    meetTime: details.meetTime ?? null,
    travelMeetTime: details.travelMeetTime ?? null,
    travelMeetPoint: details.travelMeetPoint ?? null,
    schedule: details.schedule?.trim() || null,
    travelAttire: details.travelAttire?.trim() || null,
    warmUpAttire: details.warmUpAttire?.trim() || null,
    postMatchActivity: details.postMatchActivity?.trim() || null,
  };
}

function eventRow(input: NewEvent, title: string, id: string) {
  return {
    id,
    title,
    eventType: input.eventType,
    start: input.start,
    end: input.end,
    startTbc: !!input.startTbc,
    venue: input.venue.trim(),
    notes: input.notes ?? "",
  };
}

async function insertEvent(db: Db, input: NewEvent, title: string): Promise<Event> {
  const [row] = await db
    .insert(event)
    .values(eventRow(input, title, crypto.randomUUID()))
    .returning();

  if (input.eventType === "match") {
    await db.insert(matchDetails).values({ eventId: row.id, ...matchRow(input.matchDetails) });
  }

  return row;
}

/** Every upcoming or past Event, cancelled included unless `cancelled: false` is passed. */
export async function listEvents(
  db: Db,
  { when, cancelled }: { when: "upcoming" | "past"; cancelled?: false },
): Promise<Event[]> {
  const now = new Date();
  const timing = when === "upcoming" ? gte(event.end, now) : lt(event.end, now);
  const where = cancelled === false ? and(timing, eq(event.cancelled, false)) : timing;
  return db.select().from(event).where(where).orderBy(when === "upcoming" ? asc(event.start) : desc(event.start));
}

/** Events (cancelled included) starting in [from, to), soonest first — for the month calendar. */
export async function listEventsBetween(db: Db, from: Date, to: Date): Promise<Event[]> {
  return db
    .select()
    .from(event)
    .where(and(gte(event.start, from), lt(event.start, to)))
    .orderBy(asc(event.start));
}

/** Every Match on the London day of `event` (itself included when it is one), soonest first. */
export async function listMatchDay(db: Db, event_: Pick<Event, "start">): Promise<Event[]> {
  const date = londonParts(event_.start).date;
  return db
    .select()
    .from(event)
    .where(
      and(
        eq(event.eventType, "match"),
        gte(event.start, londonToUtc(date, "00:00")),
        lt(event.start, londonToUtc(addDays(date, 1), "00:00")),
      ),
    )
    .orderBy(asc(event.start));
}

/** Venues already used, each once, most recently used first — suggestions for typing a new one. */
export async function listVenues(db: Db): Promise<string[]> {
  const venue = sql<string>`trim(${event.venue})`;
  const rows = await db
    .select({ venue })
    .from(event)
    .where(sql`${venue} <> ''`)
    .groupBy(venue)
    .orderBy(desc(sql`max(${event.start})`));
  return rows.map((r) => r.venue);
}

/** The next few upcoming Events that are still happening, soonest first. */
export async function listNextEvents(db: Db, limit: number): Promise<Event[]> {
  const now = new Date();
  return db
    .select()
    .from(event)
    .where(and(gte(event.end, now), eq(event.cancelled, false)))
    .orderBy(asc(event.start))
    .limit(limit);
}

/** Each of `ids`' titles, by Event id, in one query. Ids with no Event are left out. */
export async function listEventTitles(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: event.id, title: event.title })
    .from(event)
    .where(inArray(event.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.title]));
}

export async function getEvent(db: Db, id: string): Promise<EventWithDetails | undefined> {
  return (await getEvents(db, [id]))[0];
}

/** Several Events with their match details and Teams, in one query however many there are. Ids with no Event are left out. */
export async function getEvents(db: Db, ids: string[]): Promise<EventWithDetails[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(event)
    .leftJoin(matchDetails, eq(matchDetails.eventId, event.id))
    .leftJoin(team, eq(team.id, matchDetails.teamId))
    .where(inArray(event.id, [...new Set(ids)]));
  return rows.map((row) => ({ ...row.event, matchDetails: row.match_details, team: row.team }));
}

/**
 * Edits a standalone Event's every field in place. For an Occurrence, use
 * `editOccurrence` instead, which offers "this one" or "this and future".
 */
export async function editEvent(
  db: Db,
  id: string,
  input: NewEvent,
): Promise<Result> {
  const [stored] = await db.select().from(event).where(eq(event.id, id));
  if (!stored) return { ok: false, error: "That event no longer exists." };
  if (stored.eventType !== input.eventType) return { ok: false, error: "An event's type can't be changed." };
  const result = validateEvent(input);
  if (!result.ok) return result;
  const title = await titleFor(db, input);
  if (!title.ok) return title;

  await db.transaction(async (tx) => {
    await tx
      .update(event)
      .set({
        title: title.title,
        start: input.start,
        end: input.end,
        startTbc: !!input.startTbc,
        venue: input.venue.trim(),
        notes: input.notes ?? "",
      })
      .where(eq(event.id, id));

    if (input.eventType === "match") {
      await tx.update(matchDetails).set(matchRow(input.matchDetails)).where(eq(matchDetails.eventId, id));
    }
  });

  return { ok: true };
}

export async function cancelEvent(db: Db, id: string) {
  await db.update(event).set({ cancelled: true }).where(eq(event.id, id));
}

/**
 * Removes an Event for good, with its Match details. Other features' records of it
 * (Duties, Availability, selection…) go through their own `deleteFor…` functions.
 */
export async function deleteEvent(db: Db, id: string) {
  await db.transaction(async (tx) => {
    await tx.delete(matchDetails).where(eq(matchDetails.eventId, id));
    await tx.delete(event).where(eq(event.id, id));
  });
}

