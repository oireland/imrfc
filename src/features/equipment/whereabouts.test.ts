import { describe, expect, it } from "vitest";
import { groupByWhereabouts, quickMoveFor, type EquipmentRow } from "./whereabouts";
import type { EquipmentUnit } from "./index";
import type { Portion } from "./portions";

function unit(overrides: Partial<EquipmentUnit>): EquipmentUnit {
  return {
    id: "equipment-1",
    name: "Ball bag A",
    description: "",
    homeId: "store-1",
    status: "active",
    conditionNote: "",
    quantity: 1,
    ...overrides,
  };
}

function portion(overrides: Partial<Portion>): Portion {
  return {
    id: crypto.randomUUID(),
    equipmentUnitId: "equipment-1",
    count: 1,
    whereaboutsType: "store",
    storeId: "store-1",
    holderId: null,
    lastSeenEventId: null,
    ...overrides,
  };
}

function row(unitOverrides: Partial<EquipmentUnit>, portionOverrides: Partial<Portion>): EquipmentRow {
  return { unit: unit(unitOverrides), portion: portion(portionOverrides) };
}

describe("groupByWhereabouts", () => {
  it("groups Equipment Units by Store", () => {
    const rows = [row({}, { storeId: "store-1" }), row({}, { storeId: "store-1" })];

    expect(groupByWhereabouts(rows)).toEqual([{ type: "store", storeId: "store-1", rows }]);
  });

  it("groups Equipment Units by Holder", () => {
    const held = row({}, { whereaboutsType: "holder", storeId: null, holderId: "user-1" });

    expect(groupByWhereabouts([held])).toEqual([{ type: "holder", holderId: "user-1", rows: [held] }]);
  });

  it("keeps Stores and Holders as separate groups", () => {
    const stored = row({}, { storeId: "store-1" });
    const held = row({}, { whereaboutsType: "holder", storeId: null, holderId: "user-1" });

    expect(groupByWhereabouts([stored, held])).toEqual([
      { type: "store", storeId: "store-1", rows: [stored] },
      { type: "holder", holderId: "user-1", rows: [held] },
    ]);
  });

  it("puts the viewer's own Equipment Units first", () => {
    const stored = row({}, { storeId: "store-1" });
    const theirs = row({}, { whereaboutsType: "holder", storeId: null, holderId: "other" });
    const mine = row({}, { whereaboutsType: "holder", storeId: null, holderId: "me" });

    expect(groupByWhereabouts([stored, theirs, mine], "me")).toEqual([
      { type: "holder", holderId: "me", rows: [mine] },
      { type: "store", storeId: "store-1", rows: [stored] },
      { type: "holder", holderId: "other", rows: [theirs] },
    ]);
  });

  it("puts Unconfirmed Equipment Units in a final group", () => {
    const stored = row({}, { storeId: "store-1" });
    const lost = row({}, { whereaboutsType: "unconfirmed", storeId: null, lastSeenEventId: "e1" });

    expect(groupByWhereabouts([lost, stored])).toEqual([
      { type: "store", storeId: "store-1", rows: [stored] },
      { type: "unconfirmed", rows: [lost] },
    ]);
  });

  it("shows a split Equipment Unit once per group, each with its own count there", () => {
    const atShed = row({ name: "Tackle shields", quantity: 8 }, { storeId: "shed", count: 4 });
    const withSam = row({ name: "Tackle shields", quantity: 8 }, { whereaboutsType: "holder", storeId: null, holderId: "sam", count: 4 });

    expect(groupByWhereabouts([atShed, withSam])).toEqual([
      { type: "store", storeId: "shed", rows: [atShed] },
      { type: "holder", holderId: "sam", rows: [withSam] },
    ]);
  });
});

describe("quickMoveFor", () => {
  it("offers to take an Equipment Unit that is in a Store", () => {
    expect(quickMoveFor(row({}, { whereaboutsType: "store", storeId: "store-1" }), "me")).toMatchObject({
      count: 1,
      from: { type: "store", storeId: "store-1" },
      to: { type: "holder", holderId: "me" },
    });
  });

  it("offers to take an Equipment Unit someone else holds or that is Unconfirmed", () => {
    expect(quickMoveFor(row({}, { whereaboutsType: "holder", storeId: null, holderId: "other" }), "me")).toMatchObject({
      to: { type: "holder", holderId: "me" },
    });
    expect(quickMoveFor(row({}, { whereaboutsType: "unconfirmed", storeId: null, lastSeenEventId: "e1" }), "me")).toMatchObject({
      to: { type: "holder", holderId: "me" },
    });
  });

  it("offers to return an Equipment Unit I hold to its Home", () => {
    expect(
      quickMoveFor(row({ homeId: "home-store" }, { whereaboutsType: "holder", storeId: null, holderId: "me" }), "me"),
    ).toMatchObject({ to: { type: "store", storeId: "home-store" } });
  });

  it("only offers the count in that Portion, for a split Equipment Unit", () => {
    const withSam = row({ quantity: 8 }, { whereaboutsType: "holder", storeId: null, holderId: "sam", count: 4 });
    expect(quickMoveFor(withSam, "sam")).toMatchObject({ count: 4, from: { type: "holder", holderId: "sam" } });
  });

  it("takes just some of a Portion when asked for fewer", () => {
    const inShed = row({ quantity: 8 }, { whereaboutsType: "store", storeId: "store-1", count: 5 });
    expect(quickMoveFor(inShed, "me", 2)).toMatchObject({ count: 2, to: { type: "holder", holderId: "me" } });
  });

  it("never moves more than the Portion holds, or fewer than 1", () => {
    const inShed = row({ quantity: 8 }, { whereaboutsType: "store", storeId: "store-1", count: 5 });
    expect(quickMoveFor(inShed, "me", 9).count).toBe(5);
    expect(quickMoveFor(inShed, "me", 0).count).toBe(1);
    expect(quickMoveFor(inShed, "me", Number.NaN).count).toBe(5);
  });
});
