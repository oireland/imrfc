import { LIMITS, firstTooLong } from "@/lib/text-limits";
import type { Result } from "@/lib/result";
// Match isn't a Series Event Type: it needs an opponent and other Match-only details a Series pattern doesn't model.
export type SeriesEventType = "training" | "social";

export type SeriesPattern = {
  title?: string; // Social only; a Training Series is titled from its venue
  eventType?: SeriesEventType; // defaults to "training"
  weekdays: number[]; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:MM", Europe/London
  endTime: string;
  venue: string;
  startDate: string; // "YYYY-MM-DD", Europe/London
  endDate: string;
  notes?: string;
};

/** Calendar dates (inclusive) between start and end that fall on one of the weekdays. */
export function occurrenceDates(p: { weekdays: number[]; startDate: string; endDate: string }): string[] {
  const dates: string[] = [];
  const end = Date.parse(`${p.endDate}T00:00:00Z`);
  for (let t = Date.parse(`${p.startDate}T00:00:00Z`); t <= end; t += 86_400_000) {
    const day = new Date(t);
    if (p.weekdays.includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

/** The most Occurrences one Series can have: about a year of weekly sessions, or a term of several a week. */
export const MAX_OCCURRENCES = 100;
/** A Series can't span more than this many days, so a typo'd year is caught before any dates are worked out. */
const MAX_SPAN_DAYS = 731;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

export function checkOccurrenceCount(adding: number, existing: number): Result {
  if (existing + adding <= MAX_OCCURRENCES) return { ok: true };
  return {
    ok: false,
    error: `That would make ${existing + adding} events. A series can have at most ${MAX_OCCURRENCES}, so pick an earlier last date.`,
  };
}

export function validateSeries(p: SeriesPattern): Result {
  const tooLong = firstTooLong([
    ["title", p.title, LIMITS.name],
    ["venue", p.venue, LIMITS.line],
    ["notes", p.notes, LIMITS.note],
  ]);
  if (tooLong) return { ok: false, error: tooLong };
  if ((p.eventType ?? "training") === "social" && !(p.title ?? "").trim()) return { ok: false, error: "Give the series a title." };
  if (p.weekdays.length === 0 || !p.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return { ok: false, error: "Pick at least one day of the week." };
  }
  if (!p.venue.trim()) return { ok: false, error: "Where is it? Add a venue." };
  if (!TIME.test(p.startTime) || !TIME.test(p.endTime)) return { ok: false, error: "Enter the start and end as a time, like 19:00." };
  if (!isDate(p.startDate) || !isDate(p.endDate)) return { ok: false, error: "Enter the first and last date as real dates." };
  if (p.endTime <= p.startTime) return { ok: false, error: "The end time must be after the start time." };
  if (p.endDate < p.startDate) return { ok: false, error: "The last date can't be before the first date." };
  if (Date.parse(`${p.endDate}T00:00:00Z`) - Date.parse(`${p.startDate}T00:00:00Z`) > MAX_SPAN_DAYS * 86_400_000) {
    return { ok: false, error: "The last date is too far after the first. A series can run for two years at most." };
  }
  return { ok: true };
}
