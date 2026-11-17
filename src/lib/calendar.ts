/** Calendar helpers for display. Dates are `YYYY-MM-DD` strings in Europe/London. */

const LONDON_HOUR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" });

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
