import { describe, expect, it } from "vitest";
import { gatherConfirmSources, gatherFromDutyUsers, handedOnSources, needsSourceChoice, validateHolderSplit } from "./confirm-source-rules";
import type { Portion } from "@/features/equipment";

const portion = (over: Partial<Portion>): Portion => ({
  id: "p",
  equipmentUnitId: "k",
  count: 1,
  whereaboutsType: "store",
  storeId: null,
  holderId: null,
  lastSeenEventId: null,
  ...over,
});

describe("gatherConfirmSources", () => {
  it("prefers the Duty's own People's Portions", () => {
    const portions = [
      portion({ whereaboutsType: "holder", holderId: "tom", count: 2 }),
      portion({ whereaboutsType: "store", storeId: "home", count: 6 }),
    ];
    expect(gatherConfirmSources(portions, { dutyUserIds: ["tom"], homeStoreId: "home", count: 2 })).toEqual({
      sources: [{ place: { type: "holder", holderId: "tom" }, count: 2 }],
      ok: true,
    });
  });

  it("falls back to Home, then another Store, then another Holder", () => {
    const home = portion({ whereaboutsType: "store", storeId: "home", count: 4 });
    expect(gatherConfirmSources([home], { dutyUserIds: ["tom"], homeStoreId: "home", count: 4 })).toEqual({
      sources: [{ place: { type: "store", storeId: "home" }, count: 4 }],
      ok: true,
    });

    const other = portion({ whereaboutsType: "store", storeId: "other", count: 4 });
    expect(gatherConfirmSources([other], { dutyUserIds: ["tom"], homeStoreId: "home", count: 4 })).toEqual({
      sources: [{ place: { type: "store", storeId: "other" }, count: 4 }],
      ok: true,
    });

    const sam = portion({ whereaboutsType: "holder", holderId: "sam", count: 4 });
    expect(gatherConfirmSources([sam], { dutyUserIds: ["tom"], homeStoreId: "home", count: 4 })).toEqual({
      sources: [{ place: { type: "holder", holderId: "sam" }, count: 4 }],
      ok: true,
    });
  });

  it("gathers across several Places, in priority order, when one isn't enough", () => {
    const portions = [
      portion({ whereaboutsType: "holder", holderId: "tom", count: 1 }),
      portion({ whereaboutsType: "store", storeId: "home", count: 2 }),
      portion({ whereaboutsType: "store", storeId: "other", count: 5 }),
    ];
    expect(gatherConfirmSources(portions, { dutyUserIds: ["tom"], homeStoreId: "home", count: 4 })).toEqual({
      sources: [
        { place: { type: "holder", holderId: "tom" }, count: 1 },
        { place: { type: "store", storeId: "home" }, count: 2 },
        { place: { type: "store", storeId: "other" }, count: 1 },
      ],
      ok: true,
    });
  });

  it("ignores emptied-out Portions and reports when there still isn't enough", () => {
    const portions = [portion({ whereaboutsType: "store", storeId: "home", count: 0 })];
    expect(gatherConfirmSources(portions, { dutyUserIds: ["tom"], homeStoreId: "home", count: 1 })).toEqual({
      sources: [],
      ok: false,
    });
  });
});

describe("needsSourceChoice", () => {
  it("is false when what's already with the Duty's People is enough", () => {
    const portions = [portion({ whereaboutsType: "holder", holderId: "tom", count: 4 })];
    expect(needsSourceChoice(portions, { dutyUserIds: ["tom"], count: 4 })).toBe(false);
  });

  it("is false when a single other Place can supply the rest", () => {
    const portions = [
      portion({ whereaboutsType: "holder", holderId: "tom", count: 1 }),
      portion({ whereaboutsType: "store", storeId: "home", count: 3 }),
    ];
    expect(needsSourceChoice(portions, { dutyUserIds: ["tom"], count: 4 })).toBe(false);
  });

  it("is true when the rest is spread across more than one other Place", () => {
    const portions = [
      portion({ whereaboutsType: "store", storeId: "home", count: 2 }),
      portion({ whereaboutsType: "store", storeId: "other", count: 2 }),
    ];
    expect(needsSourceChoice(portions, { dutyUserIds: ["tom"], count: 4 })).toBe(true);
  });
});

describe("gatherFromDutyUsers", () => {
  it("gathers from each of the Duty's People's own Portions, in order", () => {
    const portions = [
      portion({ whereaboutsType: "holder", holderId: "sam", count: 2 }),
      portion({ whereaboutsType: "holder", holderId: "tom", count: 2 }),
    ];
    expect(gatherFromDutyUsers(portions, { userIds: ["tom", "sam"], count: 3 })).toEqual({
      sources: [
        { place: { type: "holder", holderId: "tom" }, count: 2 },
        { place: { type: "holder", holderId: "sam" }, count: 1 },
      ],
      ok: true,
    });
  });

  it("falls back to a Store the rest is sitting at when the Duty's People don't hold enough", () => {
    const portions = [
      portion({ whereaboutsType: "holder", holderId: "tom", count: 1 }),
      portion({ whereaboutsType: "store", storeId: "shed", count: 3 }),
    ];
    expect(gatherFromDutyUsers(portions, { userIds: ["tom"], count: 4 })).toEqual({
      sources: [
        { place: { type: "holder", holderId: "tom" }, count: 1 },
        { place: { type: "store", storeId: "shed" }, count: 3 },
      ],
      ok: true,
    });
  });

  it("never falls back to someone else's Portion — that's a real Move, not loose bookkeeping", () => {
    const portions = [portion({ whereaboutsType: "holder", holderId: "priya", count: 4 })];
    expect(gatherFromDutyUsers(portions, { userIds: ["tom"], count: 4 })).toEqual({ sources: [], ok: false });
  });
});

describe("validateHolderSplit", () => {
  it("accepts a split that adds up to the count, over the duty's own people", () => {
    expect(
      validateHolderSplit(4, [{ userId: "tom", count: 2 }, { userId: "sam", count: 2 }], ["tom", "sam"]),
    ).toEqual({ ok: true });
  });

  it("rejects a split that doesn't add up", () => {
    expect(validateHolderSplit(4, [{ userId: "tom", count: 1 }, { userId: "sam", count: 2 }], ["tom", "sam"])).toEqual({
      ok: false,
      error: "Counts must add up to 4.",
    });
  });

  it("rejects a negative count", () => {
    expect(validateHolderSplit(4, [{ userId: "tom", count: -1 }, { userId: "sam", count: 5 }], ["tom", "sam"])).toEqual({
      ok: false,
      error: "Counts can't be negative.",
    });
  });

  it("rejects someone not on the duty", () => {
    expect(validateHolderSplit(4, [{ userId: "priya", count: 4 }], ["tom", "sam"])).toEqual({
      ok: false,
      error: "Only the duty's people can hold it.",
    });
  });
});

describe("handedOnSources", () => {
  const held = (holderId: string, count: number) => portion({ whereaboutsType: "holder", holderId, count });

  it("offers each other holder who has what the Duty's People don't", () => {
    expect(handedOnSources([held("sam", 4)], { userIds: ["tom"], count: 4 })).toEqual([
      { holderId: "sam", sources: [{ place: { type: "holder", holderId: "sam" }, count: 4 }] },
    ]);
  });

  it("takes what the Duty's People hold first and the rest from the other holder", () => {
    expect(handedOnSources([held("tom", 1), held("sam", 3)], { userIds: ["tom"], count: 4 })).toEqual([
      {
        holderId: "sam",
        sources: [
          { place: { type: "holder", holderId: "tom" }, count: 1 },
          { place: { type: "holder", holderId: "sam" }, count: 3 },
        ],
      },
    ]);
  });

  it("offers nothing when the Duty's People (or a Store) can already cover it, or no one else has enough", () => {
    expect(handedOnSources([held("tom", 4), held("sam", 4)], { userIds: ["tom"], count: 4 })).toEqual([]);
    expect(handedOnSources([portion({ storeId: "home", count: 4 })], { userIds: ["tom"], count: 4 })).toEqual([]);
    expect(handedOnSources([held("sam", 2)], { userIds: ["tom"], count: 4 })).toEqual([]);
  });
});
