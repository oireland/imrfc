import { describe, expect, it } from "vitest";
import { findClashes } from "./clashes-rules";
import type { PlanEvent, PlanKit } from "./plan";

const at = (iso: string) => new Date(iso);

const kit = (over: Partial<PlanKit> = {}): PlanKit => ({
  id: "balls",
  name: "Balls",
  status: "active",
  quantity: 1,
  portions: [],
  ...over,
});

const event = (over: Partial<PlanEvent> = {}): PlanEvent => ({
  id: "e1",
  title: "Training",
  start: at("2026-10-20T19:00:00Z"),
  end: at("2026-10-20T21:00:00Z"),
  items: [{ kitUnitId: "balls", count: 1 }],
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
      findClashes({ kit: [kit({ status: "missing" })], events: [soonAndUnfilled] }),
    ).toEqual([]);
  });

  describe("Quantity", () => {
    const shields = kit({ id: "shields", name: "tackle shields", quantity: 8 });

    it("is fine when overlapping Events between them ask for no more than the Quantity", () => {
      const a = event({ id: "a", title: "1st XV v Kings", items: [{ kitUnitId: "shields", count: 4 }] });
      const b = event({
        id: "b",
        title: "2nd XV v UCL",
        start: at("2026-10-20T20:00:00Z"),
        end: at("2026-10-20T22:00:00Z"),
        items: [{ kitUnitId: "shields", count: 4 }],
      });

      expect(findClashes({ kit: [shields], events: [a, b] })).toEqual([]);
    });

    it("clashes when overlapping Events between them ask for more than the Quantity", () => {
      const a = event({ id: "a", title: "1st XV v Kings", items: [{ kitUnitId: "shields", count: 6 }] });
      const b = event({
        id: "b",
        title: "2nd XV v UCL",
        start: at("2026-10-20T20:00:00Z"),
        end: at("2026-10-20T22:00:00Z"),
        items: [{ kitUnitId: "shields", count: 4 }],
      });

      expect(findClashes({ kit: [shields], events: [a, b] })).toEqual([
        {
          kind: "overlap",
          kitUnitId: "shields",
          eventIds: ["a", "b"],
          message: "1st XV v Kings and 2nd XV v UCL need 10 tackle shields between them, but the club only has 8.",
        },
      ]);
    });

    it("sums three overlapping Events, not just adjacent pairs", () => {
      const a = event({ id: "a", title: "A", items: [{ kitUnitId: "shields", count: 3 }] });
      const b = event({
        id: "b",
        title: "B",
        start: at("2026-10-20T19:30:00Z"),
        end: at("2026-10-20T20:30:00Z"),
        items: [{ kitUnitId: "shields", count: 3 }],
      });
      const c = event({
        id: "c",
        title: "C",
        start: at("2026-10-20T20:15:00Z"),
        end: at("2026-10-20T21:15:00Z"),
        items: [{ kitUnitId: "shields", count: 3 }],
      });

      expect(findClashes({ kit: [shields], events: [a, b, c] })).toEqual([
        expect.objectContaining({ kind: "overlap", eventIds: ["a", "b", "c"] }),
      ]);
    });

    it("clashes back-to-back Events only when their counts add up to more than the Quantity", () => {
      const noFrom = { direction: "from" as const, kitUnitId: "shields", userId: null };
      const a = event({
        id: "a",
        title: "A",
        items: [{ kitUnitId: "shields", count: 4 }],
        duties: [{ kitUnitId: "shields", direction: "to", userId: "tom" }, noFrom],
      });
      const fine = event({
        id: "b",
        title: "B",
        start: at("2026-10-20T21:30:00Z"),
        end: at("2026-10-20T23:00:00Z"),
        items: [{ kitUnitId: "shields", count: 4 }],
      });

      expect(findClashes({ kit: [shields], events: [a, fine] })).toEqual([]);

      const tooMany = { ...fine, items: [{ kitUnitId: "shields", count: 6 }] };
      expect(findClashes({ kit: [shields], events: [a, tooMany] })).toEqual([
        expect.objectContaining({ kind: "back_to_back", eventIds: ["a", "b"] }),
      ]);
    });
  });
});
