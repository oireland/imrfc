import { describe, expect, it } from "vitest";
import {
  checkLower,
  checkSplitMove,
  mergePortions,
  pairFlows,
  parsePlaceKey,
  placeKey,
  singlePlace,
  totalQuantity,
  type Place,
  type Portion,
} from "./portions";

function portion(overrides: Partial<Portion>): Portion {
  return {
    id: crypto.randomUUID(),
    equipmentUnitId: "equipment-1",
    count: 1,
    whereaboutsType: "store",
    storeId: "shed",
    holderId: null,
    lastSeenEventId: null,
    ...overrides,
  };
}

describe("totalQuantity", () => {
  it("sums every portion's count", () => {
    expect(totalQuantity([portion({ count: 4 }), portion({ count: 3, whereaboutsType: "holder", storeId: null, holderId: "sam" })])).toBe(7);
  });
});

describe("mergePortions", () => {
  it("merges portions at the same Store into one", () => {
    const merged = mergePortions([portion({ count: 3 }), portion({ count: 5 })]);
    expect(merged).toEqual([expect.objectContaining({ count: 8, whereaboutsType: "store", storeId: "shed" })]);
  });

  it("merges portions with the same Holder", () => {
    const merged = mergePortions([
      portion({ count: 2, whereaboutsType: "holder", storeId: null, holderId: "sam" }),
      portion({ count: 1, whereaboutsType: "holder", storeId: null, holderId: "sam" }),
    ]);
    expect(merged).toEqual([expect.objectContaining({ count: 3, holderId: "sam" })]);
  });

  it("keeps Unconfirmed portions from different Events apart", () => {
    const a = portion({ count: 1, whereaboutsType: "unconfirmed", storeId: null, lastSeenEventId: "e1" });
    const b = portion({ count: 1, whereaboutsType: "unconfirmed", storeId: null, lastSeenEventId: "e2" });
    expect(mergePortions([a, b])).toHaveLength(2);
  });

  it("drops portions whose count has fallen to zero", () => {
    const merged = mergePortions([portion({ count: 3 }), portion({ count: -3 })]);
    expect(merged).toEqual([]);
  });

  it("keeps different Stores as separate portions", () => {
    const merged = mergePortions([portion({ storeId: "shed" }), portion({ storeId: "cupboard" })]);
    expect(merged).toHaveLength(2);
  });
});

describe("singlePlace", () => {
  it("returns the one place when there is exactly one portion", () => {
    const p = portion({ storeId: "shed" });
    expect(singlePlace([p])).toEqual({ type: "store", storeId: "shed" });
  });

  it("returns undefined when the Equipment Unit is split across places", () => {
    const a = portion({ count: 4, storeId: "shed" });
    const b = portion({ count: 4, whereaboutsType: "holder", storeId: null, holderId: "sam" });
    expect(singlePlace([a, b])).toBeUndefined();
  });
});

describe("checkSplitMove", () => {
  const shedPlace = { type: "store", storeId: "shed" } as const;
  const tom = { type: "holder", holderId: "tom" } as const;

  it("accepts a count gathered from several source places, or split across several targets", () => {
    const shed = portion({ count: 2, storeId: "shed" });
    const cupboard = portion({ count: 3, storeId: "cupboard" });
    expect(
      checkSplitMove([shed, cupboard], {
        sources: [
          { from: shedPlace, count: 2 },
          { from: { type: "store", storeId: "cupboard" }, count: 2 },
        ],
        targets: [{ to: tom, count: 4 }],
      }),
    ).toEqual({ ok: true });
    expect(
      checkSplitMove([shed], {
        sources: [{ from: shedPlace, count: 2 }],
        targets: [
          { to: tom, count: 1 },
          { to: { type: "holder", holderId: "sam" }, count: 1 },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it("rejects sources that don't add up to the targets, so a Quantity can't grow", () => {
    const sam = portion({ count: 1, whereaboutsType: "holder", storeId: null, holderId: "sam" });
    expect(checkSplitMove([sam], { sources: [], targets: [{ to: tom, count: 1 }] })).toEqual({
      ok: false,
      error: "What's being moved doesn't add up.",
    });
    expect(
      checkSplitMove([sam], { sources: [{ from: { type: "holder", holderId: "sam" }, count: 1 }], targets: [{ to: tom, count: 3 }] }).ok,
    ).toBe(false);
  });

  it("rejects negative or fractional counts", () => {
    const shed = portion({ count: 4 });
    expect(checkSplitMove([shed], { sources: [{ from: shedPlace, count: -2 }], targets: [{ to: tom, count: -2 }] }).ok).toBe(false);
    expect(checkSplitMove([shed], { sources: [{ from: shedPlace, count: 1.5 }], targets: [{ to: tom, count: 1.5 }] }).ok).toBe(false);
  });

  it("rejects a source place that doesn't have enough, even when it's also the target", () => {
    const shed = portion({ count: 1, storeId: "shed" });
    expect(checkSplitMove([shed], { sources: [{ from: shedPlace, count: 2 }], targets: [{ to: tom, count: 2 }] })).toEqual({
      ok: false,
      error: "There aren't 2 there to move.",
    });
    // Pairing drops a flow from a Place to itself, so only this check stops it.
    expect(checkSplitMove([shed], { sources: [{ from: shedPlace, count: 2 }], targets: [{ to: shedPlace, count: 2 }] })).toEqual({
      ok: false,
      error: "There aren't 2 there to move.",
    });
  });
});

describe("pairFlows", () => {
  it("pairs sources with targets into flows that move the same totals", () => {
    const shed = { type: "store", storeId: "shed" } as const;
    const cupboard = { type: "store", storeId: "cupboard" } as const;
    const tom = { type: "holder", holderId: "tom" } as const;
    const sam = { type: "holder", holderId: "sam" } as const;
    expect(
      pairFlows<Place>(
        [
          { from: shed, count: 2 },
          { from: cupboard, count: 2 },
        ],
        [
          { to: tom, count: 3 },
          { to: sam, count: 1 },
        ],
      ),
    ).toEqual([
      { from: shed, to: tom, count: 2 },
      { from: cupboard, to: tom, count: 1 },
      { from: cupboard, to: sam, count: 1 },
    ]);
  });
});

describe("checkLower", () => {
  const shedPlace = { type: "store", storeId: "shed" } as const;

  it("picks the place automatically when there is only one portion", () => {
    expect(checkLower([portion({ count: 8, storeId: "shed" })], { removeCount: 2 })).toEqual({ ok: true, place: shedPlace });
  });

  it("asks which place when split, and uses the one given", () => {
    const shed = portion({ count: 4, storeId: "shed" });
    const sam = portion({ count: 4, whereaboutsType: "holder", storeId: null, holderId: "sam" });
    expect(checkLower([shed, sam], { removeCount: 2 })).toEqual({ ok: false, error: "Choose where to lower it from." });
    expect(checkLower([shed, sam], { removeCount: 2, from: shedPlace })).toEqual({ ok: true, place: shedPlace });
  });

  it("rejects lowering below 1", () => {
    expect(checkLower([portion({ count: 1, storeId: "shed" })], { removeCount: 1 })).toEqual({
      ok: false,
      error: "Can't lower an equipment unit's quantity below 1.",
    });
  });

  it("rejects removing more than is at the chosen place", () => {
    const shed = portion({ count: 4, storeId: "shed" });
    const sam = portion({ count: 4, whereaboutsType: "holder", storeId: null, holderId: "sam" });
    expect(checkLower([shed, sam], { removeCount: 5, from: shedPlace })).toEqual({
      ok: false,
      error: "There aren't 5 there to remove.",
    });
  });
});

describe("place keys", () => {
  it("round-trips every kind of Place, keeping Unconfirmed apart from the Store", () => {
    const places = [
      { type: "store", storeId: "shed" },
      { type: "holder", holderId: "tom" },
      { type: "unconfirmed", lastSeenEventId: "e1" },
    ] as const;
    for (const place of places) expect(parsePlaceKey(placeKey(place))).toEqual(place);
    expect(new Set(places.map(placeKey)).size).toBe(3);
  });
});
