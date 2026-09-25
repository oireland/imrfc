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

/**
 * Formats a Date for display in Europe/London, 24-hour clock, e.g. "Wed 24 Sep, 18:00".
 * The year is appended only when it differs from `now`'s London year, e.g.
 * "Wed 24 Sep 2025, 18:00".
 */
export function formatWhen(date: Date, now: Date = new Date()): string {
  const weekday = WEEKDAY.format(date);
  const day = DAY.format(date);
  const month = MONTHS[Number(MONTH_INDEX.format(date)) - 1];
  const time = TIME.format(date);
  const year = YEAR.format(date);
  const nowYear = YEAR.format(now);
  const datePart = year === nowYear ? `${weekday} ${day} ${month}` : `${weekday} ${day} ${month} ${year}`;
  return `${datePart}, ${time}`;
}
