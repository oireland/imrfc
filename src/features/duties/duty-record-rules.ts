import { londonParts, londonToUtc } from "@/lib/time/london";

/** The season (1 Sep–31 Aug, Europe/London) containing `now`, as its start instant. */
export function seasonStart(now: Date): Date {
  const { date } = londonParts(now);
  const londonYear = Number(date.slice(0, 4));
  const londonMonth = Number(date.slice(5, 7));
  const year = londonMonth >= 9 ? londonYear : londonYear - 1;
  return londonToUtc(`${year}-09-01`, "00:00");
}

export type PastDutyRow = { eventEnd: Date; confirmedAt: Date | null };

/** This season's Duty count: done (Confirmed) vs. never confirmed. Cancelled Events are left out upstream. */
export function seasonCount(rows: PastDutyRow[], now: Date): { done: number; neverConfirmed: number } {
  const since = seasonStart(now);
  const inSeason = rows.filter((r) => r.eventEnd >= since);
  return {
    done: inSeason.filter((r) => r.confirmedAt).length,
    neverConfirmed: inSeason.filter((r) => !r.confirmedAt).length,
  };
}

/** The most recent past Duties, soonest-ended first, capped at `limit`. */
export function lastDuties<T extends PastDutyRow>(rows: T[], limit: number): T[] {
  return [...rows].sort((a, b) => b.eventEnd.getTime() - a.eventEnd.getTime()).slice(0, limit);
}
