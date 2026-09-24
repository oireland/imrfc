import { describe, expect, it } from "vitest";
import { groupByWhereabouts } from "./whereabouts";
import type { KitUnit } from "./index";

function unit(overrides: Partial<KitUnit>): KitUnit {
  return {
    id: crypto.randomUUID(),
    name: "Ball bag A",
    description: "",
    homeId: "store-1",
    status: "active",
    conditionNote: "",
    whereaboutsType: "store",
    storeId: "store-1",
    holderId: null,
    lastSeenEventId: null,
    ...overrides,
  };
}

describe("groupByWhereabouts", () => {
  it("groups Kit Units by Store", () => {
    const units = [unit({ storeId: "store-1" }), unit({ storeId: "store-1" })];

    expect(groupByWhereabouts(units)).toEqual([
      { type: "store", storeId: "store-1", units },
    ]);
  });

  it("groups Kit Units by Holder", () => {
    const held = unit({ whereaboutsType: "holder", storeId: null, holderId: "user-1" });

    expect(groupByWhereabouts([held])).toEqual([
      { type: "holder", holderId: "user-1", units: [held] },
    ]);
  });

  it("keeps Stores and Holders as separate groups", () => {
    const stored = unit({ storeId: "store-1" });
    const held = unit({ whereaboutsType: "holder", storeId: null, holderId: "user-1" });

    expect(groupByWhereabouts([stored, held])).toEqual([
      { type: "store", storeId: "store-1", units: [stored] },
      { type: "holder", holderId: "user-1", units: [held] },
    ]);
  });

  it("puts Unconfirmed Kit Units in a final group", () => {
    const stored = unit({ storeId: "store-1" });
    const lost = unit({ whereaboutsType: "unconfirmed", storeId: null, lastSeenEventId: "e1" });

    expect(groupByWhereabouts([lost, stored])).toEqual([
      { type: "store", storeId: "store-1", units: [stored] },
      { type: "unconfirmed", units: [lost] },
    ]);
  });
});
