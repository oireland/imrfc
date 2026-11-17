import type { Db } from "@/db/types";
import { LIMITS, firstTooLong } from "@/lib/text-limits";
import { and, asc, count, eq, gte } from "drizzle-orm";
import { event, series } from "./schema";
import { trainingTitle } from "./rules";
import {
  checkOccurrenceCount,
  occurrenceDates,
  validateSeries,
  type SeriesPattern,
} from "./series-rules";
import { addDays, londonParts, londonToUtc } from "@/lib/london";
import type { Failure } from "@/lib/result";

export type NewSeries = SeriesPattern;
export type Series = typeof series.$inferSelect;
export type Occurrence = typeof event.$inferSelect;
export type OccurrenceChanges = Partial<
  Pick<SeriesPattern, "title" | "venue" | "notes" | "startTime" | "endTime">
>;


async function insertOccurrences(db: Db, s: Series, dates: string[]) {
  if (dates.length === 0) return;
  const rows = dates.map((date) => ({
    id: crypto.randomUUID(),
    title: s.title,
    eventType: s.eventType,
    start: londonToUtc(date, s.startTime),
    end: londonToUtc(date, s.endTime),
    venue: s.venue,
    notes: s.notes,
    seriesId: s.id,
  }));
  await db.insert(event).values(rows);
}

/** A Social Series is titled by hand; a Training Series after its venue. */
function seriesTitle(p: { eventType?: string; title?: string; venue: string }): string {
  return p.eventType === "social" ? (p.title ?? "").trim() : trainingTitle(p.venue);
}

export async function createSeries(
  db: Db,
  input: NewSeries,
): Promise<{ ok: true; series: Series } | Failure> {
  const result = validateSeries(input);
  if (!result.ok) return result;

  const dates = occurrenceDates(input);
  const size = checkOccurrenceCount(dates.length, 0);
  if (!size.ok) return size;

  const row = await db.transaction(async (tx) => {
    const [created] = await tx
    .insert(series)
    .values({
      id: crypto.randomUUID(),
      title: seriesTitle(input),
      eventType: input.eventType ?? "training",
      weekdays: input.weekdays,
      startTime: input.startTime,
      endTime: input.endTime,
      venue: input.venue,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes ?? "",
    })
    .returning();
    await insertOccurrences(tx, created, dates);
    return created;
  });
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
  const [row] = await db.select().from(series).where(eq(series.id, seriesId));
  if (!row) return { ok: false, error: "That series no longer exists." };
  const valid = validateSeries({ ...row, eventType: row.eventType as SeriesPattern["eventType"], endDate: newEndDate });
  if (!valid.ok) return valid;
  if (newEndDate <= row.endDate) {
    return { ok: false, error: "Pick a date after the current last date." };
  }

  const nextDay = addDays(row.endDate, 1);
  const dates = occurrenceDates({ weekdays: row.weekdays, startDate: nextDay, endDate: newEndDate });
  const [{ existing }] = await db.select({ existing: count() }).from(event).where(eq(event.seriesId, seriesId));
  const size = checkOccurrenceCount(dates.length, Number(existing));
  if (!size.ok) return size;

  await db.transaction(async (tx) => {
    await insertOccurrences(tx, row, dates);
    await tx.update(series).set({ endDate: newEndDate }).where(eq(series.id, seriesId));
  });
  return { ok: true };
}

export async function editOccurrence(
  db: Db,
  eventId: string,
  changes: OccurrenceChanges,
  scope: "this" | "future",
): Promise<{ ok: true } | Failure> {
  const [target] = await db.select().from(event).where(eq(event.id, eventId));
  if (!target?.seriesId) return { ok: false, error: "That event isn't part of a series." };

  const tooLong = firstTooLong([
    ["title", changes.title, LIMITS.name],
    ["venue", changes.venue, LIMITS.line],
    ["notes", changes.notes, LIMITS.note],
  ]);
  if (tooLong) return { ok: false, error: tooLong };

  const current = { start: londonParts(target.start).time, end: londonParts(target.end).time };
  const startTime = changes.startTime ?? current.start;
  const endTime = changes.endTime ?? current.end;
  if (endTime <= startTime) return { ok: false, error: "The end time must be after the start time." };
  if (target.eventType === "social" && changes.title !== undefined && !changes.title.trim()) {
    return { ok: false, error: "Give the event a title." };
  }
  // A Training is titled from its venue, so only a Social can be retitled.
  const titleFor = (row: { eventType: string; venue: string; title: string }): string | undefined => {
    const venue = changes.venue ?? row.venue;
    return row.eventType === "training" ? trainingTitle(venue) : changes.title?.trim();
  };

  const apply = (row: Occurrence, edited: boolean) => {
    const date = londonParts(row.start).date;
    return db
      .update(event)
      .set({
        ...(titleFor(row) !== undefined && { title: titleFor(row) }),
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

  const later = await db
    .select()
    .from(event)
    .where(and(eq(event.seriesId, target.seriesId), gte(event.start, target.start)));
  await Promise.all(later.filter((row) => row.id === target.id || !row.edited).map((row) => apply(row, false)));
  await db
    .update(series)
    .set({
      ...(titleFor(target) !== undefined && { title: titleFor(target) }),
      ...(changes.venue !== undefined && { venue: changes.venue }),
      ...(changes.notes !== undefined && { notes: changes.notes }),
      startTime,
      endTime,
    })
    .where(eq(series.id, target.seriesId));
  return { ok: true };
}
