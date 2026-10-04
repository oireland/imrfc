import { describe, expect, it } from "vitest";
import { buildCalendar, type FeedEvent } from "./ics-rules";

const now = new Date("2026-09-01T09:00:00Z");
const training: FeedEvent = {
  id: "e1",
  title: "Tuesday Training",
  start: new Date("2026-09-08T17:30:00Z"),
  end: new Date("2026-09-08T19:00:00Z"),
  venue: "Har-Ha Sports Ground",
  description: "",
  cancelled: false,
};

const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");
const lines = (ics: string) => unfold(ics).split("\r\n");

describe("buildCalendar", () => {
  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    const ics = buildCalendar([training], now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines(ics)).toContain("VERSION:2.0");
    expect(lines(ics)).toContain("PRODID:-//IMRFC Club Hub//EN");
  });

  it("writes an Event's times in UTC, title, venue and a stable UID", () => {
    const l = lines(buildCalendar([training], now));
    expect(l).toContain("UID:e1@imrfc");
    expect(l).toContain("DTSTAMP:20260901T090000Z");
    expect(l).toContain("DTSTART:20260908T173000Z");
    expect(l).toContain("DTEND:20260908T190000Z");
    expect(l).toContain("SUMMARY:Tuesday Training");
    expect(l).toContain("LOCATION:Har-Ha Sports Ground");
    expect(l).toContain("STATUS:CONFIRMED");
  });

  it("writes an Event whose start is TBC as an all-day entry on its London date", () => {
    const tbc = { ...training, start: new Date("2026-10-23T23:00:00Z"), end: new Date("2026-10-24T22:59:00Z"), startTbc: true };
    const l = lines(buildCalendar([tbc], now));
    expect(l).toContain("DTSTART;VALUE=DATE:20261024");
    expect(l).toContain("DTEND;VALUE=DATE:20261025");
  });

  it("marks a Cancelled Event STATUS:CANCELLED", () => {
    const l = lines(buildCalendar([{ ...training, cancelled: true }], now));
    expect(l).toContain("STATUS:CANCELLED");
  });

  it("escapes commas, semicolons, backslashes and newlines in text", () => {
    const l = lines(
      buildCalendar([{ ...training, title: "A, B; C\\D", description: "You're bringing: Balls\nand cones" }], now),
    );
    expect(l).toContain("SUMMARY:A\\, B\; C\\\\D");
    expect(l).toContain("DESCRIPTION:You're bringing: Balls\\nand cones");
  });

  it("omits DESCRIPTION when there is none", () => {
    expect(buildCalendar([training], now)).not.toContain("DESCRIPTION");
  });

  it("folds lines longer than 75 octets", () => {
    const ics = buildCalendar([{ ...training, description: "x".repeat(200) }], now);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines(ics)).toContain(`DESCRIPTION:${"x".repeat(200)}`);
  });
});
