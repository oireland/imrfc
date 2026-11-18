import { describe, expect, it } from "vitest";
import { describeWhereabouts, groupByWhereabouts, historyLine, portionLabel, quickMoveFor, type EquipmentRow, type HistoryNames } from "./whereabouts";
import type { movementLogEntry } from "./schema";
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

describe("historyLine", () => {
  const names: HistoryNames = {
    storeName: (id) => (id ? `the ${id}` : "a store"),
    personName: (id) => (id === "me" ? "you" : id ? id : "someone"),
    eventName: (id) => id ?? "an event",
  };
  function entry(overrides: Partial<typeof movementLogEntry.$inferSelect>) {
    return {
      id: "e1",
      seq: 1,
      equipmentUnitId: "equipment-1",
      kind: "move",
      userId: "Tom",
      reason: "ad_hoc",
      count: null,
      fromType: null,
      fromStoreId: null,
      fromHolderId: null,
      fromLastSeenEventId: null,
      toType: null,
      toStoreId: null,
      toHolderId: null,
      toLastSeenEventId: null,
      conditionNote: null,
      createdAt: new Date(),
      ...overrides,
    } as typeof movementLogEntry.$inferSelect;
  }
  const line = (o: Partial<typeof movementLogEntry.$inferSelect>, split = false) => historyLine(entry(o), names, split);

  it("words a Condition Note", () => {
    expect(line({ kind: "condition_note", conditionNote: "torn" })).toBe("Tom noted: “torn”");
  });
  it("words added stock, with or without a known user", () => {
    expect(line({ kind: "added", toStoreId: "shed" })).toBe("Tom added it to the shed");
    expect(line({ kind: "added", userId: null, toStoreId: "shed", count: 4 }, true)).toBe("Someone added 4 to the shed");
  });
  it("words an opening balance in a Store, with a Holder and unconfirmed", () => {
    expect(line({ kind: "opening", toType: "store", toStoreId: "shed" })).toBe("Where it was when this log began: in the shed");
    expect(line({ kind: "opening", toType: "holder", toHolderId: "Sam" })).toBe("Where it was when this log began: with Sam");
    expect(line({ kind: "opening", toType: "unconfirmed", toLastSeenEventId: "Cup final" }, false)).toBe(
      "Where it was when this log began: unconfirmed after Cup final",
    );
  });
  it("words bought and lost", () => {
    expect(line({ kind: "bought", count: 3 })).toBe("Tom bought 3");
    expect(line({ kind: "lost", userId: "me", count: 2 })).toBe("You lost 2");
  });
  it("words unconfirmed", () => {
    expect(line({ kind: "unconfirmed", userId: null, toLastSeenEventId: "Cup final", count: 3 }, true)).toBe(
      "Nobody confirmed where 3 went after Cup final",
    );
  });
  it("words ad hoc moves", () => {
    expect(line({ toType: "store", toStoreId: "shed" })).toBe("Tom put it in the shed");
    expect(line({ toType: "holder", toHolderId: "Tom" })).toBe("Tom took it");
    expect(line({ toType: "holder", toHolderId: "Priya" })).toBe("Tom gave it to Priya");
    expect(line({ toType: "store", toStoreId: "shed", count: 2 }, true)).toBe("Tom put 2 in the shed");
  });
  it("words moves made by finishing a Duty", () => {
    expect(line({ reason: "duty", toType: "store", toStoreId: "shed" })).toBe("Tom put it back in the shed (duty done)");
    expect(line({ reason: "duty", toType: "holder", toHolderId: "Tom" })).toBe("Tom brought it along (duty done)");
    expect(line({ reason: "duty", toType: "holder", toHolderId: "Priya" })).toBe("Tom confirmed it's with Priya (duty done)");
    expect(line({ reason: "duty", toType: "holder", toHolderId: "Priya", count: 3 }, true)).toBe(
      "Tom confirmed 3 is with Priya (duty done)",
    );
  });
});

describe("portionLabel", () => {
  const names = {
    storeName: (id: string) => `the ${id}`,
    personName: (id: string) => (id === "me" ? "you" : id),
    eventName: () => "Training",
  };

  it("names a whole Portion by where it is", () => {
    expect(portionLabel(portion({ whereaboutsType: "store", storeId: "Shed" }), names, { showCount: false })).toBe("In the Shed");
    expect(portionLabel(portion({ whereaboutsType: "holder", storeId: null, holderId: "Sam" }), names, { showCount: false })).toBe("With Sam");
    expect(
      portionLabel(portion({ whereaboutsType: "unconfirmed", storeId: null, lastSeenEventId: "e1" }), names, { showCount: false }),
    ).toBe("Not confirmed — last seen at Training");
  });

  it("puts the count first when the Equipment Unit is split", () => {
    expect(portionLabel(portion({ count: 4, whereaboutsType: "store", storeId: "Shed" }), names, { showCount: true })).toBe("4 at the Shed");
    expect(portionLabel(portion({ count: 2, whereaboutsType: "holder", storeId: null, holderId: "me" }), names, { showCount: true })).toBe("2 with you");
  });

  it("describeWhereabouts joins a split unit's labels", () => {
    const portions = [
      portion({ count: 4, whereaboutsType: "store", storeId: "Shed" }),
      portion({ count: 2, whereaboutsType: "holder", storeId: null, holderId: "Sam" }),
    ];
    expect(describeWhereabouts(portions, names)).toBe("4 at the Shed · 2 with Sam");
  });
});
