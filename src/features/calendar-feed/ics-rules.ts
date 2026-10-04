// ICS (RFC 5545) rendering for the Calendar Feed. Pure, no database or Next.js.
import { londonParts } from "@/features/events";

export type FeedEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  venue: string;
  description: string;
  cancelled: boolean;
  /** The start time isn't known yet, so it is an all-day entry. */
  startTbc?: boolean;
};

const escapeText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** The day after a YYYY-MM-DD date, as YYYYMMDD. */
function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Folds a content line to at most 75 octets, continuing with a leading space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts towards the limit.
    const limit = out.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildCalendar(events: FeedEvent[], now: Date): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//IMRFC Club Hub//EN", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@imrfc`,
      `DTSTAMP:${utc(now)}`,
      ...(e.startTbc
        ? [`DTSTART;VALUE=DATE:${londonParts(e.start).date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${nextDay(londonParts(e.start).date)}`]
        : [`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`]),
      `SUMMARY:${escapeText(e.title)}`,
      `LOCATION:${escapeText(e.venue)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
