import { describe, expect, it } from "vitest";
import { addDays, londonDay, londonParts, londonTime, londonToUtc } from "./london";

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

describe("londonDay", () => {
  it("uses the London date during BST", () => {
    expect(londonDay(new Date("2026-10-24T23:30:00Z"))).toBe("2026-10-25");
  });

  it("uses the London date after the clocks go back", () => {
    expect(londonDay(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-25");
  });
});

describe("londonTime", () => {
  it("formats the London 24-hour time either side of the clocks going back", () => {
    expect(londonTime(new Date("2026-10-24T18:00:00Z"))).toBe("19:00");
    expect(londonTime(new Date("2026-10-26T18:00:00Z"))).toBe("18:00");
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("londonParts", () => {
  it("gives the London date and time either side of the clocks going back", () => {
    expect(londonParts(new Date("2026-10-24T23:30:00Z"))).toEqual({ date: "2026-10-25", time: "00:30" });
    expect(londonParts(new Date("2026-10-25T23:30:00Z"))).toEqual({ date: "2026-10-25", time: "23:30" });
  });
});
