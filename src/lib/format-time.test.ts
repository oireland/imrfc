import { describe, expect, it } from "vitest";
import { formatAgo, formatWhen } from "./format-time";

describe("formatWhen", () => {
  it("formats a summer (BST) instant in Europe/London, 24-hour", () => {
    // 2025-09-24T17:00:00Z is 18:00 in London during BST (+1h).
    const now = new Date("2025-09-01T00:00:00Z");
    expect(formatWhen(new Date("2025-09-24T17:00:00Z"), now)).toBe("Wed 24 Sep, 18:00");
  });

  it("formats a winter (GMT) instant in Europe/London, no offset", () => {
    // 2025-12-24T18:00:00Z is 18:00 in London during GMT (+0h).
    const now = new Date("2025-12-01T00:00:00Z");
    expect(formatWhen(new Date("2025-12-24T18:00:00Z"), now)).toBe("Wed 24 Dec, 18:00");
  });

  it("appends the year when it differs from now's London year", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(formatWhen(new Date("2025-12-24T18:00:00Z"), now)).toBe("Wed 24 Dec 2025, 18:00");
  });

  it("omits the year when it matches now's London year", () => {
    const now = new Date("2025-06-01T00:00:00Z");
    expect(formatWhen(new Date("2025-12-24T18:00:00Z"), now)).toBe("Wed 24 Dec, 18:00");
  });

  it("handles an instant just before the last Sunday of October (still BST)", () => {
    // 2025-10-26 01:00 UTC is before the 01:00 UTC clock change; London is still BST (+1h) -> 02:00 local.
    const now = new Date("2025-10-01T00:00:00Z");
    expect(formatWhen(new Date("2025-10-26T00:30:00Z"), now)).toBe("Sun 26 Oct, 01:30");
  });

  it("handles an instant just after the last Sunday of October (back to GMT)", () => {
    // 2025-10-26 01:30 UTC is after the clock change; London is GMT (+0h) -> 01:30 local.
    const now = new Date("2025-10-01T00:00:00Z");
    expect(formatWhen(new Date("2025-10-26T01:30:00Z"), now)).toBe("Sun 26 Oct, 01:30");
  });

  it("handles an instant just before the last Sunday of March (still GMT)", () => {
    // 2026-03-29 00:30 UTC is before the 01:00 UTC clock change; London is GMT (+0h) -> 00:30 local.
    const now = new Date("2026-03-01T00:00:00Z");
    expect(formatWhen(new Date("2026-03-29T00:30:00Z"), now)).toBe("Sun 29 Mar, 00:30");
  });

  it("handles an instant just after the last Sunday of March (now BST)", () => {
    // 2026-03-29 01:30 UTC is after the clock change; London is BST (+1h) -> 02:30 local.
    const now = new Date("2026-03-01T00:00:00Z");
    expect(formatWhen(new Date("2026-03-29T01:30:00Z"), now)).toBe("Sun 29 Mar, 02:30");
  });
});

describe("formatAgo", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it.each([
    [new Date("2026-10-01T11:59:30Z"), "just now"],
    [new Date("2026-10-01T11:45:00Z"), "15m ago"],
    [new Date("2026-10-01T10:00:00Z"), "2h ago"],
    [new Date("2026-09-28T12:00:00Z"), "3d ago"],
  ])("says %s as %s", (date, expected) => {
    expect(formatAgo(date, now)).toBe(expected);
  });
});
