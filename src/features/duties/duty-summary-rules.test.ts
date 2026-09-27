import { describe, expect, it } from "vitest";
import { formatDutySummary } from "./duty-summary-rules";

const base = {
  title: "1sts & 2nds Training",
  start: new Date("2026-10-01T18:00:00Z"), // 19:00 BST
  venueName: "Harlington",
};

describe("formatDutySummary", () => {
  it("summarises an Event with its Duties, flagging unassigned ones", () => {
    const text = formatDutySummary({
      ...base,
      items: [
        { kitName: "Ball bag A", count: 1, quantity: 1, to: "Tom", from: "Tom" },
        { kitName: "Tackle shields", count: 1, quantity: 1, to: "Sam", from: "Priya" },
        { kitName: "Cones", count: 1, quantity: 1, to: null, from: null },
      ],
    });
    expect(text).toBe(
      [
        "🏉 Thu 1 Oct — 1sts & 2nds Training, 19:00, Harlington",
        "Ball bag A: Tom → / ← Tom",
        "Tackle shields: Sam → / ← Priya",
        "Cones: ❗unassigned",
      ].join("\n"),
    );
  });

  it("flags only the unassigned side when one Duty is filled", () => {
    const text = formatDutySummary({
      ...base,
      items: [{ kitName: "Cones", count: 1, quantity: 1, to: "Sam", from: null }],
    });
    expect(text.split("\n")[1]).toBe("Cones: Sam → / ← ❗unassigned");
  });

  it("shows London time in winter", () => {
    const text = formatDutySummary({ ...base, start: new Date("2026-12-02T19:00:00Z"), items: [] });
    expect(text).toBe("🏉 Wed 2 Dec — 1sts & 2nds Training, 19:00, Harlington");
  });

  it("shows the count after the Kit Unit's name when its Quantity is more than 1", () => {
    const text = formatDutySummary({
      ...base,
      items: [{ kitName: "Tackle shields", count: 4, quantity: 8, to: "Tom", from: "Tom" }],
    });
    expect(text.split("\n")[1]).toBe("Tackle shields ×4: Tom → / ← Tom");
  });
});
