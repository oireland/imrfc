// Europe/London date and time helpers. Dates are `YYYY-MM-DD` strings (London calendar days), times `HH:MM`.
// No server-only imports: this is used from client components too.

const DAY_MS = 86_400_000;

const LONDON_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const LONDON = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const LONDON_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The Europe/London calendar date of an instant (default: now), as `YYYY-MM-DD`. */
export function londonDay(instant: Date = new Date()): string {
  return LONDON_DAY.format(instant);
}

/** The Europe/London 24-hour clock time of an instant, e.g. "19:00". */
export function londonTime(instant: Date): string {
  return LONDON_TIME.format(instant);
}

/** `date` shifted by whole days. Works on the calendar date in UTC, so it is DST-safe. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function londonOffsetMs(instant: Date): number {
  const parts = Object.fromEntries(LONDON.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The Europe/London calendar date and clock time of a UTC instant. */
export function londonParts(instant: Date): { date: string; time: string } {
  const parts = Object.fromEntries(LONDON.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(+parts.hour % 24).padStart(2, "0")}:${parts.minute}`,
  };
}

/** Converts a Europe/London wall-clock date and time to the UTC instant. */
export function londonToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const guess = naive - londonOffsetMs(new Date(naive));
  return new Date(naive - londonOffsetMs(new Date(guess)));
}
