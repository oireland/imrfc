import { describe, expect, it } from "vitest";
import { greeting, londonDay, londonTime, monthGrid } from "./calendar";

describe("monthGrid", () => {
  it("lays a month out Monday-first over six weeks", () => {
    const days = monthGrid(2026, 8); // September 2026 starts on a Tuesday

    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-08-31");
    expect(days[1]).toBe("2026-09-01");
    expect(days[41]).toBe("2026-10-11");
  });

  it("starts on the 1st when the month begins on a Monday", () => {
    expect(monthGrid(2026, 5)[0]).toBe("2026-06-01");
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

describe("greeting", () => {
  it("says Morning, Afternoon or Evening by London hour", () => {
    expect(greeting(new Date("2026-01-10T09:00:00Z"))).toBe("Morning");
    expect(greeting(new Date("2026-07-10T11:30:00Z"))).toBe("Afternoon"); // 12:30 BST
    expect(greeting(new Date("2026-01-10T18:00:00Z"))).toBe("Evening");
  });
});

describe("londonTime", () => {
  it("formats the London 24-hour time either side of the clocks going back", () => {
    expect(londonTime(new Date("2026-10-24T18:00:00Z"))).toBe("19:00");
    expect(londonTime(new Date("2026-10-26T18:00:00Z"))).toBe("18:00");
  });
});
