import { describe, expect, it } from "vitest";
import { londonToUtc, occurrenceDates, validateSeries } from "./series-rules";

describe("londonToUtc", () => {
  it("is the same clock time in winter (GMT)", () => {
    expect(londonToUtc("2026-01-07", "19:00").toISOString()).toBe("2026-01-07T19:00:00.000Z");
  });

  it("is an hour earlier in UTC in summer (BST)", () => {
    expect(londonToUtc("2026-06-03", "19:00").toISOString()).toBe("2026-06-03T18:00:00.000Z");
  });

  it("switches on the day BST starts", () => {
    expect(londonToUtc("2026-03-28", "19:00").toISOString()).toBe("2026-03-28T19:00:00.000Z");
    expect(londonToUtc("2026-03-29", "19:00").toISOString()).toBe("2026-03-29T18:00:00.000Z");
  });

  it("switches back on the day BST ends", () => {
    expect(londonToUtc("2026-10-24", "19:00").toISOString()).toBe("2026-10-24T18:00:00.000Z");
    expect(londonToUtc("2026-10-25", "19:00").toISOString()).toBe("2026-10-25T19:00:00.000Z");
  });
});

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
    title: "Training",
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

  it.each([
    [{ title: " " }, "title"],
    [{ weekdays: [] }, "day of the week"],
    [{ venue: " " }, "venue"],
    [{ endTime: "18:00" }, "end"],
    [{ endDate: "2026-01-01" }, "last date"],
  ])("rejects %j", (patch, word) => {
    const result = validateSeries({ ...ok, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(word);
  });
});
