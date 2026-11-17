import { describe, expect, it } from "vitest";
import { applyEntry, replay, sameWhereabouts, type LedgerEntry } from "./ledger";
import type { Place, Portion } from "./portions";

const SHED: Place = { type: "store", storeId: "shed" };
const CLUBHOUSE: Place = { type: "store", storeId: "clubhouse" };
const SAM: Place = { type: "holder", holderId: "sam" };
const LAST_SEEN: Place = { type: "unconfirmed", lastSeenEventId: "match-1" };

/** Portions as place → count pairs, ignoring ids and order. */
function where(portions: Portion[]): Record<string, number> {
  return Object.fromEntries(
    portions.map((p) => [`${p.whereaboutsType}:${p.storeId ?? p.holderId ?? p.lastSeenEventId}`, p.count]),
  );
}

function replayed(entries: LedgerEntry[]): Record<string, number> {
  const result = replay("cones", entries);
  if (!result.ok) throw new Error(result.error);
  return where(result.portions);
}

describe("replay", () => {
  it("has nothing anywhere before any entry", () => {
    expect(replayed([])).toEqual({});
  });

  it("puts a new Equipment Unit's starting stock where it was added", () => {
    expect(replayed([{ kind: "added", count: 10, to: SHED }])).toEqual({ "store:shed": 10 });
  });

  it("moves a count from one Place to another", () => {
    expect(
      replayed([
        { kind: "added", count: 10, to: SHED },
        { kind: "move", count: 4, from: SHED, to: SAM },
      ]),
    ).toEqual({ "store:shed": 6, "holder:sam": 4 });
  });

  it("merges a count moved back into what's already there", () => {
    expect(
      replayed([
        { kind: "added", count: 10, to: SHED },
        { kind: "move", count: 4, from: SHED, to: SAM },
        { kind: "move", count: 4, from: SAM, to: SHED },
      ]),
    ).toEqual({ "store:shed": 10 });
  });

  it("marks a count Unconfirmed, last seen at an Event, and moves it on from there", () => {
    expect(
      replayed([
        { kind: "added", count: 3, to: SHED },
        { kind: "move", count: 3, from: SHED, to: SAM },
        { kind: "unconfirmed", count: 2, from: SAM, to: LAST_SEEN },
      ]),
    ).toEqual({ "holder:sam": 1, "unconfirmed:match-1": 2 });
    expect(
      replayed([
        { kind: "added", count: 3, to: SHED },
        { kind: "unconfirmed", count: 3, from: SHED, to: LAST_SEEN },
        { kind: "move", count: 3, from: LAST_SEEN, to: CLUBHOUSE },
      ]),
    ).toEqual({ "store:clubhouse": 3 });
  });

  it("adds bought stock and takes away lost stock", () => {
    expect(
      replayed([
        { kind: "added", count: 2, to: SHED },
        { kind: "bought", count: 3, to: SHED },
        { kind: "move", count: 2, from: SHED, to: SAM },
        { kind: "lost", count: 1, from: SAM },
      ]),
    ).toEqual({ "store:shed": 3, "holder:sam": 1 });
  });

  it("skips Condition Notes", () => {
    expect(
      replayed([
        { kind: "added", count: 1, to: SHED },
        { kind: "condition_note" },
      ]),
    ).toEqual({ "store:shed": 1 });
  });

  it("refuses an entry that takes more from a Place than is there", () => {
    const result = replay("cones", [
      { kind: "added", count: 2, to: SHED },
      { kind: "move", count: 3, from: SHED, to: SAM },
    ]);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("entry 2") });
  });

  it("labels every Portion with the Equipment Unit", () => {
    const result = replay("cones", [{ kind: "added", count: 1, to: SHED }]);
    expect(result.ok && result.portions.map((p) => p.equipmentUnitId)).toEqual(["cones"]);
  });
});

describe("applyEntry", () => {
  it("carries on from the current Portions", () => {
    const start = replay("cones", [{ kind: "added", count: 5, to: SHED }]);
    if (!start.ok) throw new Error(start.error);
    const next = applyEntry(start.portions, { kind: "move", count: 5, from: SHED, to: SAM });
    expect(next.ok && where(next.portions)).toEqual({ "holder:sam": 5 });
  });

  it("refuses a count that isn't a whole number above zero", () => {
    expect(applyEntry([], { kind: "added", count: 0, to: SHED }).ok).toBe(false);
    expect(applyEntry([], { kind: "added", count: 1.5, to: SHED }).ok).toBe(false);
  });
});

describe("sameWhereabouts", () => {
  it("compares Portions by Place and count, not by id or order", () => {
    const a = replay("cones", [
      { kind: "added", count: 5, to: SHED },
      { kind: "move", count: 2, from: SHED, to: SAM },
    ]);
    const b = replay("cones", [
      { kind: "added", count: 3, to: SHED },
      { kind: "added", count: 2, to: SAM },
    ]);
    if (!a.ok || !b.ok) throw new Error("replay failed");
    expect(sameWhereabouts(a.portions, [...b.portions].reverse())).toBe(true);
  });

  it("notices a different count at a Place", () => {
    const a = replay("cones", [{ kind: "added", count: 5, to: SHED }]);
    const b = replay("cones", [{ kind: "added", count: 4, to: SHED }]);
    if (!a.ok || !b.ok) throw new Error("replay failed");
    expect(sameWhereabouts(a.portions, b.portions)).toBe(false);
  });
});
