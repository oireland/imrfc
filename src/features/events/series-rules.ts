export type SeriesPattern = {
  title: string;
  weekdays: number[]; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:MM", Europe/London
  endTime: string;
  venueId: string;
  startDate: string; // "YYYY-MM-DD", Europe/London
  endDate: string;
  notes?: string;
  teamIds?: string[];
};

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

export function validateSeries(p: SeriesPattern): { ok: true } | { ok: false; error: string } {
  if (!p.title.trim()) return { ok: false, error: "Give the series a title." };
  if (p.weekdays.length === 0) return { ok: false, error: "Pick at least one day of the week." };
  if (!p.venueId) return { ok: false, error: "Choose a venue." };
  if (p.endTime <= p.startTime) return { ok: false, error: "The end time must be after the start time." };
  if (p.endDate < p.startDate) return { ok: false, error: "The last date can't be before the first date." };
  return { ok: true };
}
