// Calendar days as `YYYY-MM-DD` strings (London days): shifting, writing out, and today.

const DAY_MS = 86_400_000;

/** `date` shifted by whole days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "3 Nov". */
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.parse(date)));
}

const LONDON_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's London calendar date. */
export function londonToday(now: Date = new Date()): string {
  return LONDON_DAY.format(now);
}
