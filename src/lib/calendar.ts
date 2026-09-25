/** Calendar helpers for display. Dates are `YYYY-MM-DD` strings in Europe/London. */

const LONDON_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const LONDON_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" });

/** The Europe/London calendar date of an instant, as `YYYY-MM-DD`. */
export function londonDay(instant: Date): string {
  return LONDON_DAY.format(instant);
}

/** Six Monday-first weeks covering the month (`month` is 0-based), as `YYYY-MM-DD` strings. */
export function monthGrid(year: number, month: number): string[] {
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(year, month, 1 - lead + i)).toISOString().slice(0, 10));
}

/** "Morning", "Afternoon" or "Evening" for the London time of `now`. */
export function greeting(now: Date): string {
  const hour = Number(LONDON_HOUR.format(now));
  return hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
}

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The Europe/London 24-hour clock time of an instant, e.g. "19:00". */
export function londonTime(instant: Date): string {
  return LONDON_TIME.format(instant);
}
