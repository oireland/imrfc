import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { event, matchDetails, team } from "./schema";
import { classifyEvent, eventTitle, validateEvent, type NewEvent } from "./rules";

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
export { londonParts, londonToUtc } from "./series-rules";
export { buildQuickEvent, buildQuickSeries, type QuickEventInput } from "./quick-add";
export {
  EVENT_CSV_COLUMNS,
  MAX_EVENTS_PER_IMPORT,
  eventCsvTemplate,
  readEventsCsv,
  type EventCsvResult,
} from "./csv-import";
export type { EventType, HomeAway, Competition, NewEvent, NewMatchDetails } from "./rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Event = typeof event.$inferSelect;
export type MatchDetails = typeof matchDetails.$inferSelect;
export type Team = typeof team.$inferSelect;
export type EventWithDetails = Event & { matchDetails: MatchDetails | null; teams: Team[] };

const SEED_TEAMS = ["1st XV", "2nd XV"] as const;

/** Ensures the seeded Teams exist; safe to call repeatedly. */
export async function listTeams(db: Db): Promise<Team[]> {
  await db.insert(team).values(SEED_TEAMS.map((name) => ({ id: name, name }))).onConflictDoNothing();
  return db.select().from(team).orderBy(asc(team.name));
}

export async function createEvent(
  db: Db,
  input: NewEvent,
): Promise<{ ok: true; event: Event } | { ok: false; error: string }> {
  const result = validateEvent(input);
  if (!result.ok) return result;
  const title = await titleFor(db, input);
  if (!title.ok) return title;
  return { ok: true, event: await db.transaction((tx: Db) => insertEvent(tx, input, title.title)) };
}

/** The Event's derived title; a Match's needs its Team's name, so an unknown Team is an error. */
async function titleFor(db: Db, input: NewEvent): Promise<{ ok: true; title: string } | { ok: false; error: string }> {
  if (input.eventType !== "match") return { ok: true, title: eventTitle(input) };
  const [row]: Team[] = await db.select().from(team).where(eq(team.id, input.matchDetails.teamId));
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
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const titles: string[] = [];
  for (const input of inputs) {
    const result = validateEvent(input);
    if (!result.ok) return { ok: false, error: `"${eventTitle(input)}": ${result.error}` };
    const title = await titleFor(db, input);
    if (!title.ok) return title;
    titles.push(title.title);
  }
  try {
    await db.transaction(async (tx: Db) => {
      for (const [i, input] of inputs.entries()) await insertEvent(tx, input, titles[i]);
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

async function insertEvent(db: Db, input: NewEvent, title: string): Promise<Event> {
  const [row] = await db
    .insert(event)
    .values({
      id: crypto.randomUUID(),
      title,
      eventType: input.eventType,
      start: input.start,
      end: input.end,
      startTbc: !!input.startTbc,
      venue: input.venue.trim(),
      notes: input.notes ?? "",
    })
    .returning();

  if (input.eventType === "match") {
    await db.insert(matchDetails).values({ eventId: row.id, ...matchRow(input.matchDetails) });
  }

  return row;
}

export async function listEvents(db: Db, { when }: { when: "upcoming" | "past" }): Promise<Event[]> {
  const now = new Date();
  return when === "upcoming"
    ? db.select().from(event).where(gte(event.end, now)).orderBy(asc(event.start))
    : db.select().from(event).where(lt(event.end, now)).orderBy(desc(event.start));
}

/** Events (cancelled included) starting in [from, to), soonest first — for the month calendar. */
export async function listEventsBetween(db: Db, from: Date, to: Date): Promise<Event[]> {
  return db
    .select()
    .from(event)
    .where(and(gte(event.start, from), lt(event.start, to)))
    .orderBy(asc(event.start));
}

/** Venues already used, each once, most recently used first — suggestions for typing a new one. */
export async function listVenues(db: Db): Promise<string[]> {
  const rows: { venue: string }[] = await db.select({ venue: event.venue }).from(event).orderBy(desc(event.start));
  return [...new Set(rows.map((r) => r.venue.trim()).filter(Boolean))];
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
  const rows: { id: string; title: string }[] = await db
    .select({ id: event.id, title: event.title })
    .from(event)
    .where(inArray(event.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r.title]));
}

export async function getEvent(db: Db, id: string): Promise<EventWithDetails | undefined> {
  const [row] = await db.select().from(event).where(eq(event.id, id));
  if (!row) return undefined;

  const details: MatchDetails | null =
    row.eventType === "match"
      ? ((await db.select().from(matchDetails).where(eq(matchDetails.eventId, id)))[0] ?? null)
      : null;
  const teams: Team[] = details ? await db.select().from(team).where(eq(team.id, details.teamId)) : [];

  return { ...row, matchDetails: details, teams };
}

/** Several Events with their match details and Teams, in three queries however many there are. Ids with no Event are left out. */
export async function getEvents(db: Db, ids: string[]): Promise<EventWithDetails[]> {
  if (ids.length === 0) return [];
  const rows: Event[] = await db.select().from(event).where(inArray(event.id, [...new Set(ids)]));
  const matchIds = rows.filter((r) => r.eventType === "match").map((r) => r.id);
  const details: MatchDetails[] = matchIds.length ? await db.select().from(matchDetails).where(inArray(matchDetails.eventId, matchIds)) : [];
  const teamIds = [...new Set(details.map((d) => d.teamId))];
  const teams: Team[] = teamIds.length ? await db.select().from(team).where(inArray(team.id, teamIds)) : [];
  return rows.map((row) => {
    const mine = details.find((d) => d.eventId === row.id) ?? null;
    return { ...row, matchDetails: mine, teams: mine ? teams.filter((t) => t.id === mine.teamId) : [] };
  });
}

/**
 * Edits a standalone Event's every field in place. For an Occurrence, use
 * `editOccurrence` instead, which offers "this one" or "this and future".
 */
export async function editEvent(
  db: Db,
  id: string,
  input: NewEvent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [stored]: Event[] = await db.select().from(event).where(eq(event.id, id));
  if (!stored) return { ok: false, error: "That event no longer exists." };
  if (stored.eventType !== input.eventType) return { ok: false, error: "An event's type can't be changed." };
  const result = validateEvent(input);
  if (!result.ok) return result;
  const title = await titleFor(db, input);
  if (!title.ok) return title;

  await db.transaction(async (tx: Db) => {
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
  await db.delete(matchDetails).where(eq(matchDetails.eventId, id));
  await db.delete(event).where(eq(event.id, id));
}

// Re-exported for classification in read paths that already have an Event row.
export function eventStatus(row: { end: Date }): "upcoming" | "past" {
  return classifyEvent(row, new Date());
}
