import { describe, expect, it } from "vitest";
import { findClashes, type ClashEvent, type ClashKit } from "./clashes-rules";

const at = (iso: string) => new Date(iso);
const now = at("2026-10-01T09:00:00Z");

const kit = (over: Partial<ClashKit> = {}): ClashKit => ({
  id: "balls",
  name: "Balls",
  status: "active",
  holderId: null,
  ...over,
});

const event = (over: Partial<ClashEvent> = {}): ClashEvent => ({
  id: "e1",
  title: "Training",
  start: at("2026-10-20T19:00:00Z"),
  end: at("2026-10-20T21:00:00Z"),
  kitUnitIds: ["balls"],
  duties: [
    { kitUnitId: "balls", direction: "to", userId: "tom" },
    { kitUnitId: "balls", direction: "from", userId: "tom" },
  ],
  ...over,
});

describe("findClashes", () => {
  it("finds nothing when the plan looks right", () => {
    expect(findClashes({ now, kit: [kit()], events: [event()] })).toEqual([]);
  });

  it("warns when a Kit Unit is on the Checklists of two overlapping Events", () => {
    const a = event({ id: "a", title: "Training" });
    const b = event({ id: "b", title: "Match", start: at("2026-10-20T20:00:00Z"), end: at("2026-10-20T22:00:00Z") });

    const clashes = findClashes({ now, kit: [kit()], events: [a, b] });

    expect(clashes).toEqual([
      expect.objectContaining({ kind: "overlap", kitUnitId: "balls", eventIds: ["a", "b"] }),
    ]);
  });

  it("warns when Events are back-to-back and the first has no From Duty filled", () => {
    const a = event({
      id: "a",
      duties: [
        { kitUnitId: "balls", direction: "to", userId: "tom" },
        { kitUnitId: "balls", direction: "from", userId: null },
      ],
    });
    const b = event({ id: "b", start: at("2026-10-20T21:30:00Z"), end: at("2026-10-20T23:00:00Z") });

    expect(findClashes({ now, kit: [kit()], events: [a, b] })).toEqual([
      expect.objectContaining({ kind: "back_to_back", eventIds: ["a", "b"] }),
    ]);
  });

  it("is fine with back-to-back Events when the first has a From Duty filled", () => {
    const a = event({ id: "a" });
    const b = event({ id: "b", start: at("2026-10-20T21:30:00Z"), end: at("2026-10-20T23:00:00Z") });

    expect(findClashes({ now, kit: [kit()], events: [a, b] })).toEqual([]);
  });

  it("warns when the current Holder has no To Duty for the next Event that needs the Kit Unit", () => {
    const e = event({
      duties: [
        { kitUnitId: "balls", direction: "to", userId: "sam" },
        { kitUnitId: "balls", direction: "from", userId: "sam" },
      ],
    });

    expect(findClashes({ now, kit: [kit({ holderId: "tom" })], events: [e] })).toEqual([
      expect.objectContaining({ kind: "holder_without_duty", kitUnitId: "balls", eventIds: ["e1"] }),
    ]);
  });

  it("is fine when the Holder has the To Duty", () => {
    expect(findClashes({ now, kit: [kit({ holderId: "tom" })], events: [event()] })).toEqual([]);
  });

  it("warns when a Kit Unit on a Checklist is Missing or Retired", () => {
    const clashes = findClashes({ now, kit: [kit({ status: "missing" })], events: [event()] });

    expect(clashes).toEqual([expect.objectContaining({ kind: "unavailable", kitUnitId: "balls", eventIds: ["e1"] })]);
  });

  it("warns about a Duty still unfilled within 48 hours of the Event", () => {
    const soon = event({
      start: at("2026-10-02T19:00:00Z"),
      end: at("2026-10-02T21:00:00Z"),
      duties: [{ kitUnitId: "balls", direction: "to", userId: "tom" }],
    });

    expect(findClashes({ now, kit: [kit()], events: [soon] })).toEqual([
      expect.objectContaining({ kind: "unfilled_duty", kitUnitId: "balls", eventIds: ["e1"], direction: "from" }),
    ]);
  });

  it("ignores unfilled Duties more than 48 hours out", () => {
    const far = event({ duties: [] });
    expect(findClashes({ now, kit: [kit()], events: [far] })).toEqual([]);
  });
});
