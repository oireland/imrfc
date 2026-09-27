import { describe, expect, it } from "vitest";
import { lastDuties, seasonCount, seasonStart } from "./duty-record-rules";

describe("seasonStart", () => {
  it("is midnight London time on 1 Sep of this year when now is within the season (e.g. October)", () => {
    // 1 Sep midnight London (BST, UTC+1) is 31 Aug 23:00 UTC.
    expect(seasonStart(new Date("2025-10-15T12:00:00Z")).toISOString()).toBe("2025-08-31T23:00:00.000Z");
  });

  it("is 1 Sep of last year when now is before the new season starts (e.g. March)", () => {
    expect(seasonStart(new Date("2026-03-15T12:00:00Z")).toISOString()).toBe("2025-08-31T23:00:00.000Z");
  });
});

describe("seasonCount", () => {
  const now = new Date("2025-11-01T12:00:00Z");

  it("counts only Duties within this season, split into done and never confirmed", () => {
    const rows = [
      { eventEnd: new Date("2025-10-01T12:00:00Z"), confirmedAt: new Date("2025-10-01T13:00:00Z") },
      { eventEnd: new Date("2025-10-08T12:00:00Z"), confirmedAt: null },
      { eventEnd: new Date("2024-10-01T12:00:00Z"), confirmedAt: null }, // last season: excluded
    ];
    expect(seasonCount(rows, now)).toEqual({ done: 1, neverConfirmed: 1 });
  });
});

describe("lastDuties", () => {
  it("returns the most recently ended Duties first, capped at the limit", () => {
    const rows = [
      { eventEnd: new Date("2025-09-01T12:00:00Z"), confirmedAt: null },
      { eventEnd: new Date("2025-10-01T12:00:00Z"), confirmedAt: null },
      { eventEnd: new Date("2025-08-01T12:00:00Z"), confirmedAt: null },
    ];
    expect(lastDuties(rows, 2).map((r) => r.eventEnd.toISOString().slice(0, 10))).toEqual(["2025-10-01", "2025-09-01"]);
  });
});
