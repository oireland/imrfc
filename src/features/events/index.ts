import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { event, eventTeam, matchDetails, team } from "./schema";
import { classifyEvent, validateEvent, type NewEvent } from "./rules";

export { validateEvent, classifyEvent } from "./rules";
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
  return { ok: true, event: await insertEvent(db, input) };
}

/**
 * Creates many Events at once (a CSV import). All or nothing: if any one is
 * invalid or fails to save, none are created.
 */
export async function createEvents(
  db: Db,
  inputs: NewEvent[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  for (const input of inputs) {
    const result = validateEvent(input);
    if (!result.ok) return { ok: false, error: `"${input.title}": ${result.error}` };
  }
  try {
    await db.transaction(async (tx: Db) => {
      for (const input of inputs) await insertEvent(tx, input);
    });
  } catch {
    return { ok: false, error: "Couldn't save the events, so none were added. Check the teams still exist." };
  }
  return { ok: true, count: inputs.length };
}

async function insertEvent(db: Db, input: NewEvent): Promise<Event> {
  const [row] = await db
    .insert(event)
    .values({
      id: crypto.randomUUID(),
      title: input.title,
      eventType: input.eventType,
      start: input.start,
      end: input.end,
      venue: input.venue.trim(),
      notes: input.notes ?? "",
    })
    .returning();

  if (input.eventType === "match") {
    await db.insert(matchDetails).values({
      eventId: row.id,
      opponent: input.matchDetails.opponent,
      homeAway: input.matchDetails.homeAway,
      competition: input.matchDetails.competition,
      meetTime: input.matchDetails.meetTime,
      travelMeetTime: input.matchDetails.travelMeetTime ?? null,
      travelMeetPoint: input.matchDetails.travelMeetPoint ?? null,
    });
  }

  for (const teamId of input.teamIds ?? []) {
    await db.insert(eventTeam).values({ id: crypto.randomUUID(), eventId: row.id, teamId });
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
  const upcoming = await listEvents(db, { when: "upcoming" });
  return upcoming.filter((e) => !e.cancelled).slice(0, limit);
}

export async function getEvent(db: Db, id: string): Promise<EventWithDetails | undefined> {
  const [row] = await db.select().from(event).where(eq(event.id, id));
  if (!row) return undefined;

  const [details, teamRows] = await Promise.all([
    row.eventType === "match"
      ? db
          .select()
          .from(matchDetails)
          .where(eq(matchDetails.eventId, id))
          .then((rows: MatchDetails[]) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select({ id: team.id, name: team.name })
      .from(eventTeam)
      .innerJoin(team, eq(eventTeam.teamId, team.id))
      .where(eq(eventTeam.eventId, id)),
  ]);

  return { ...row, matchDetails: details, teams: teamRows };
}

export async function cancelEvent(db: Db, id: string) {
  await db.update(event).set({ cancelled: true }).where(eq(event.id, id));
}

// Re-exported for classification in read paths that already have an Event row.
export function eventStatus(row: { end: Date }): "upcoming" | "past" {
  return classifyEvent(row, new Date());
}
