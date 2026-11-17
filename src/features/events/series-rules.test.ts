import { describe, expect, it } from "vitest";
import { MAX_OCCURRENCES, checkOccurrenceCount, occurrenceDates, validateSeries } from "./series-rules";

describe("occurrenceDates", () => {
  it("lists every matching weekday from start to end date inclusive", () => {
    // 2026-01-07 is a Wednesday
    expect(occurrenceDates({ weekdays: [3], startDate: "2026-01-07", endDate: "2026-01-21" })).toEqual([
      "2026-01-07",
      "2026-01-14",
      "2026-01-21",
    ]);
  });

  it("supports several weekdays in date order", () => {
    // Mon=1, Wed=3
    expect(occurrenceDates({ weekdays: [3, 1], startDate: "2026-01-05", endDate: "2026-01-11" })).toEqual([
      "2026-01-05",
      "2026-01-07",
    ]);
  });

  it("skips days before the first matching weekday", () => {
    expect(occurrenceDates({ weekdays: [3], startDate: "2026-01-05", endDate: "2026-01-10" })).toEqual([
      "2026-01-07",
    ]);
  });
});

describe("validateSeries", () => {
  const ok = {
    weekdays: [3],
    startTime: "19:00",
    endTime: "20:30",
    venue: "Harlington",
    startDate: "2026-01-07",
    endDate: "2026-03-25",
  };

  it("accepts a well-formed Series", () => {
    expect(validateSeries(ok)).toEqual({ ok: true });
  });

  it("doesn't need a title for a Training", () => {
    expect(validateSeries({ ...ok, eventType: "training" })).toEqual({ ok: true });
  });

  it.each([
    [{ eventType: "social" as const, title: " " }, "title"],
    [{ weekdays: [] }, "day of the week"],
    [{ venue: " " }, "venue"],
    [{ endTime: "18:00" }, "end"],
    [{ endDate: "2026-01-01" }, "last date"],
    [{ weekdays: [7] }, "day of the week"],
    [{ weekdays: [1.5] }, "day of the week"],
    [{ weekdays: [-1] }, "day of the week"],
    [{ startTime: "7pm" }, "time"],
    [{ endTime: "25:00" }, "time"],
    [{ startTime: "19:60" }, "time"],
    [{ startDate: "2026-02-30" }, "date"],
    [{ endDate: "tomorrow" }, "date"],
    [{ endDate: "9999-12-31" }, "too far"],
  ])("rejects %j", (patch, word) => {
    const result = validateSeries({ ...ok, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(word);
  });
});

describe("checkOccurrenceCount", () => {
  it("allows up to the limit, counting those already made", () => {
    expect(checkOccurrenceCount(MAX_OCCURRENCES, 0)).toEqual({ ok: true });
    expect(checkOccurrenceCount(1, MAX_OCCURRENCES).ok).toBe(false);
  });

  it("says how many it would have made", () => {
    const result = checkOccurrenceCount(MAX_OCCURRENCES + 5, 0);
    expect(result).toEqual({ ok: false, error: expect.stringContaining(String(MAX_OCCURRENCES + 5)) });
  });
});

describe("validateSeries length limits", () => {
  it("rejects a venue, title or notes that's far too long", () => {
    const base = { weekdays: [3], startTime: "19:00", endTime: "20:30", venue: "Harlington", startDate: "2026-01-07", endDate: "2026-03-25" };
    expect(validateSeries({ ...base, venue: "a".repeat(201) }).ok).toBe(false);
    expect(validateSeries({ ...base, eventType: "social", title: "a".repeat(101) }).ok).toBe(false);
    expect(validateSeries({ ...base, notes: "a".repeat(1001) }).ok).toBe(false);
  });
});
