import { describe, expect, it } from "vitest";
import {
  lowerQuantity,
  mergePortions,
  moveMultiple,
  parsePlaceKey,
  placeKey,
  singlePlace,
  totalQuantity,
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

describe("moveMultiple", () => {
  it("gathers a count from several source places into one target", () => {
    const shed = portion({ count: 2, storeId: "shed" });
    const cupboard = portion({ count: 3, storeId: "cupboard" });
    const result = moveMultiple([shed, cupboard], {
      sources: [
        { from: { type: "store", storeId: "shed" }, count: 2 },
        { from: { type: "store", storeId: "cupboard" }, count: 2 },
      ],
      targets: [{ to: { type: "holder", holderId: "tom" }, count: 4 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.portions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 1, whereaboutsType: "store", storeId: "cupboard" }),
        expect.objectContaining({ count: 4, whereaboutsType: "holder", holderId: "tom" }),
      ]),
    );
  });

  it("splits a count across several target places", () => {
    const shed = portion({ count: 4, storeId: "shed" });
    const result = moveMultiple([shed], {
      sources: [{ from: { type: "store", storeId: "shed" }, count: 4 }],
      targets: [
        { to: { type: "holder", holderId: "tom" }, count: 2 },
        { to: { type: "holder", holderId: "sam" }, count: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.portions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 2, whereaboutsType: "holder", holderId: "tom" }),
        expect.objectContaining({ count: 2, whereaboutsType: "holder", holderId: "sam" }),
      ]),
    );
  });

  it("rejects sources that don't add up to the targets, so a Quantity can't grow", () => {
    const sam = portion({ count: 1, whereaboutsType: "holder", storeId: null, holderId: "sam" });
    expect(
      moveMultiple([sam], { sources: [], targets: [{ to: { type: "holder", holderId: "tom" }, count: 1 }] }),
    ).toEqual({ ok: false, error: "What's being moved doesn't add up." });
    expect(
      moveMultiple([sam], {
        sources: [{ from: { type: "holder", holderId: "sam" }, count: 1 }],
        targets: [{ to: { type: "holder", holderId: "tom" }, count: 3 }],
      }).ok,
    ).toBe(false);
  });

  it("rejects negative or fractional counts", () => {
    const shed = portion({ count: 4 });
    const from = { type: "store", storeId: "shed" } as const;
    const to = { type: "holder", holderId: "tom" } as const;
    expect(moveMultiple([shed], { sources: [{ from, count: -2 }], targets: [{ to, count: -2 }] }).ok).toBe(false);
    expect(moveMultiple([shed], { sources: [{ from, count: 1.5 }], targets: [{ to, count: 1.5 }] }).ok).toBe(false);
  });

  it("rejects a source place that doesn't have enough", () => {
    const shed = portion({ count: 1, storeId: "shed" });
    const result = moveMultiple([shed], {
      sources: [{ from: { type: "store", storeId: "shed" }, count: 2 }],
      targets: [{ to: { type: "holder", holderId: "tom" }, count: 2 }],
    });
    expect(result).toEqual({ ok: false, error: "There aren't 2 there to move." });
  });
});

describe("lowerQuantity", () => {
  it("removes the count automatically when there is only one portion", () => {
    const shed = portion({ count: 8, storeId: "shed" });
    const result = lowerQuantity([shed], { removeCount: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.portions).toEqual([expect.objectContaining({ count: 6 })]);
  });

  it("asks which place when split, and removes from the one given", () => {
    const shed = portion({ count: 4, storeId: "shed" });
    const sam = portion({ count: 4, whereaboutsType: "holder", storeId: null, holderId: "sam" });
    const noPlace = lowerQuantity([shed, sam], { removeCount: 2 });
    expect(noPlace).toEqual({ ok: false, error: "Choose where to lower it from." });

    const result = lowerQuantity([shed, sam], { removeCount: 2, from: { type: "store", storeId: "shed" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.portions).toEqual([
      expect.objectContaining({ count: 2, storeId: "shed" }),
      expect.objectContaining({ count: 4, holderId: "sam" }),
    ]);
  });

  it("rejects lowering below 1", () => {
    const shed = portion({ count: 1, storeId: "shed" });
    expect(lowerQuantity([shed], { removeCount: 1 })).toEqual({
      ok: false,
      error: "Can't lower an equipment unit's quantity below 1.",
    });
  });

  it("rejects removing more than is at the chosen place", () => {
    const shed = portion({ count: 4, storeId: "shed" });
    const sam = portion({ count: 4, whereaboutsType: "holder", storeId: null, holderId: "sam" });
    expect(lowerQuantity([shed, sam], { removeCount: 5, from: { type: "store", storeId: "shed" } })).toEqual({
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
