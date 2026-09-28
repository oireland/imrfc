const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" });
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" });
const MONTH_INDEX = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "numeric" });
const YEAR = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** The London day, e.g. "Wed 30 Sep" (never "Sept", whatever the runtime's locale data says). */
export function formatDay(date: Date): string {
  return `${WEEKDAY.format(date)} ${DAY.format(date)} ${MONTHS[Number(MONTH_INDEX.format(date)) - 1]}`;
}

/**
 * Formats a Date for display in Europe/London, 24-hour clock, e.g. "Wed 24 Sep, 18:00".
 * The year is appended only when it differs from `now`'s London year, e.g.
 * "Wed 24 Sep 2025, 18:00".
 */
export function formatWhen(date: Date, now: Date = new Date()): string {
  const time = TIME.format(date);
  const year = YEAR.format(date);
  const nowYear = YEAR.format(now);
  const datePart = year === nowYear ? formatDay(date) : `${formatDay(date)} ${year}`;
  return `${datePart}, ${time}`;
}

/** How long ago `date` was, briefly: "just now", "15m ago", "2h ago", "3d ago". */
export function formatAgo(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
