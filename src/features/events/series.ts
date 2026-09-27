import { and, asc, eq, gte } from "drizzle-orm";
import { event, eventTeam, series, seriesTeam } from "./schema";
import {
  londonParts,
  londonToUtc,
  occurrenceDates,
  validateSeries,
  type SeriesPattern,
} from "./series-rules";

export type NewSeries = SeriesPattern;
export type Series = typeof series.$inferSelect;
export type Occurrence = typeof event.$inferSelect;
export type OccurrenceChanges = Partial<
  Pick<SeriesPattern, "title" | "venue" | "notes" | "startTime" | "endTime">
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Failure = { ok: false; error: string };

async function insertOccurrences(db: Db, s: Series, dates: string[], teamIds: string[]) {
  if (dates.length === 0) return;
  const rows = dates.map((date) => ({
    id: crypto.randomUUID(),
    title: s.title,
    eventType: "training" as const,
    start: londonToUtc(date, s.startTime),
    end: londonToUtc(date, s.endTime),
    venue: s.venue,
    notes: s.notes,
    seriesId: s.id,
  }));
  await db.insert(event).values(rows);
  if (teamIds.length === 0) return;
  await db.insert(eventTeam).values(
    rows.flatMap((row) => teamIds.map((teamId) => ({ id: crypto.randomUUID(), eventId: row.id, teamId }))),
  );
}

async function seriesTeamIds(db: Db, seriesId: string): Promise<string[]> {
  const rows = await db.select().from(seriesTeam).where(eq(seriesTeam.seriesId, seriesId));
  return rows.map((r: { teamId: string }) => r.teamId);
}

export async function createSeries(
  db: Db,
  input: NewSeries,
): Promise<{ ok: true; series: Series } | Failure> {
  const result = validateSeries(input);
  if (!result.ok) return result;

  const [row] = await db
    .insert(series)
    .values({
      id: crypto.randomUUID(),
      title: input.title,
      weekdays: input.weekdays,
      startTime: input.startTime,
      endTime: input.endTime,
      venue: input.venue,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes ?? "",
    })
    .returning();

  const teamIds = input.teamIds ?? [];
  if (teamIds.length > 0) {
    await db.insert(seriesTeam).values(teamIds.map((teamId) => ({ id: crypto.randomUUID(), seriesId: row.id, teamId })));
  }
  await insertOccurrences(db, row, occurrenceDates(input), teamIds);
  return { ok: true, series: row };
}

export async function listOccurrences(db: Db, seriesId: string): Promise<Occurrence[]> {
  return db.select().from(event).where(eq(event.seriesId, seriesId)).orderBy(asc(event.start));
}

export async function listSeries(db: Db): Promise<Series[]> {
  return db.select().from(series).orderBy(asc(series.title));
}

export async function extendSeries(
  db: Db,
  seriesId: string,
  newEndDate: string,
): Promise<{ ok: true } | Failure> {
  const [row]: Series[] = await db.select().from(series).where(eq(series.id, seriesId));
  if (!row) return { ok: false, error: "That series no longer exists." };
  if (newEndDate <= row.endDate) {
    return { ok: false, error: "Pick a date after the current last date." };
  }

  const nextDay = new Date(Date.parse(`${row.endDate}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const dates = occurrenceDates({ weekdays: row.weekdays, startDate: nextDay, endDate: newEndDate });
  await insertOccurrences(db, row, dates, await seriesTeamIds(db, seriesId));
  await db.update(series).set({ endDate: newEndDate }).where(eq(series.id, seriesId));
  return { ok: true };
}

export async function editOccurrence(
  db: Db,
  eventId: string,
  changes: OccurrenceChanges,
  scope: "this" | "future",
): Promise<{ ok: true } | Failure> {
  const [target]: Occurrence[] = await db.select().from(event).where(eq(event.id, eventId));
  if (!target?.seriesId) return { ok: false, error: "That event isn't part of a series." };

  const current = { start: londonParts(target.start).time, end: londonParts(target.end).time };
  const startTime = changes.startTime ?? current.start;
  const endTime = changes.endTime ?? current.end;
  if (endTime <= startTime) return { ok: false, error: "The end time must be after the start time." };
  if (changes.title !== undefined && !changes.title.trim()) {
    return { ok: false, error: "Give the event a title." };
  }

  const apply = (row: Occurrence, edited: boolean) => {
    const date = londonParts(row.start).date;
    return db
      .update(event)
      .set({
        ...(changes.title !== undefined && { title: changes.title }),
        ...(changes.venue !== undefined && { venue: changes.venue }),
        ...(changes.notes !== undefined && { notes: changes.notes }),
        start: londonToUtc(date, startTime),
        end: londonToUtc(date, endTime),
        ...(edited && { edited: true }),
      })
      .where(eq(event.id, row.id));
  };

  if (scope === "this") {
    await apply(target, true);
    return { ok: true };
  }

  const later: Occurrence[] = await db
    .select()
    .from(event)
    .where(and(eq(event.seriesId, target.seriesId), gte(event.start, target.start)));
  await Promise.all(later.filter((row) => row.id === target.id || !row.edited).map((row) => apply(row, false)));
  await db
    .update(series)
    .set({
      ...(changes.title !== undefined && { title: changes.title }),
      ...(changes.venue !== undefined && { venue: changes.venue }),
      ...(changes.notes !== undefined && { notes: changes.notes }),
      startTime,
      endTime,
    })
    .where(eq(series.id, target.seriesId));
  return { ok: true };
}
