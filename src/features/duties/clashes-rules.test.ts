import { describe, expect, it } from "vitest";
import { findClashes } from "./clashes-rules";
import type { PlanEvent, PlanKit } from "./plan";

const at = (iso: string) => new Date(iso);

const kit = (over: Partial<PlanKit> = {}): PlanKit => ({
  id: "balls",
  name: "Balls",
  status: "active",
  holderId: null,
  ...over,
});

const event = (over: Partial<PlanEvent> = {}): PlanEvent => ({
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
    expect(findClashes({ kit: [kit()], events: [event()] })).toEqual([]);
  });

  it("warns when a Kit Unit is on the Checklists of two overlapping Events", () => {
    const a = event({ id: "a", title: "Training" });
    const b = event({ id: "b", title: "Match", start: at("2026-10-20T20:00:00Z"), end: at("2026-10-20T22:00:00Z") });

    const clashes = findClashes({ kit: [kit()], events: [a, b] });

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

    expect(findClashes({ kit: [kit()], events: [a, b] })).toEqual([
      expect.objectContaining({ kind: "back_to_back", eventIds: ["a", "b"] }),
    ]);
  });

  it("is fine with back-to-back Events when the first has a From Duty filled", () => {
    const a = event({ id: "a" });
    const b = event({ id: "b", start: at("2026-10-20T21:30:00Z"), end: at("2026-10-20T23:00:00Z") });

    expect(findClashes({ kit: [kit()], events: [a, b] })).toEqual([]);
  });

  it("says what clashes in plain words", () => {
    const a = event({ id: "a", title: "Training" });
    const b = event({ id: "b", title: "Match", start: at("2026-10-20T20:00:00Z"), end: at("2026-10-20T22:00:00Z") });
    const c = event({
      id: "c",
      title: "Social",
      start: at("2026-10-20T23:00:00Z"),
      end: at("2026-10-21T01:00:00Z"),
    });
    const unfilledFrom = { ...b, duties: [{ kitUnitId: "balls", direction: "to" as const, userId: "tom" }] };

    expect(findClashes({ kit: [kit()], events: [a, unfilledFrom, c] }).map((x) => x.message)).toEqual([
      "Training and Match overlap, and both need Balls.",
      "Social starts straight after Match and both need Balls, but nobody is taking Balls away from Match yet.",
    ]);
  });

  it("only clashes over kit needed at Events too close together, not over who is carrying it", () => {
    const soonAndUnfilled = event({
      start: at("2026-10-02T08:00:00Z"),
      end: at("2026-10-02T10:00:00Z"),
      duties: [],
    });

    expect(
      findClashes({ kit: [kit({ holderId: "sam", status: "missing" })], events: [soonAndUnfilled] }),
    ).toEqual([]);
  });
});
