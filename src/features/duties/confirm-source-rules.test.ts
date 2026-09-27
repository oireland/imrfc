import { describe, expect, it } from "vitest";
import { defaultConfirmSource } from "./confirm-source-rules";
import type { Portion } from "@/features/kit";

const portion = (over: Partial<Portion>): Portion => ({
  id: "p",
  kitUnitId: "k",
  count: 1,
  whereaboutsType: "store",
  storeId: null,
  holderId: null,
  lastSeenEventId: null,
  ...over,
});

describe("defaultConfirmSource", () => {
  it("prefers the Duty's own User's Portion", () => {
    const portions = [
      portion({ whereaboutsType: "holder", holderId: "tom", count: 2 }),
      portion({ whereaboutsType: "store", storeId: "home", count: 6 }),
    ];
    expect(defaultConfirmSource(portions, { dutyUserId: "tom", homeStoreId: "home" })).toEqual({
      type: "holder",
      holderId: "tom",
    });
  });

  it("falls back to Home when the Duty's User holds none", () => {
    const portions = [
      portion({ whereaboutsType: "store", storeId: "home", count: 4 }),
      portion({ whereaboutsType: "store", storeId: "other", count: 4 }),
    ];
    expect(defaultConfirmSource(portions, { dutyUserId: "tom", homeStoreId: "home" })).toEqual({
      type: "store",
      storeId: "home",
    });
  });

  it("falls back to another Store when Home has none", () => {
    const portions = [portion({ whereaboutsType: "store", storeId: "other", count: 4 })];
    expect(defaultConfirmSource(portions, { dutyUserId: "tom", homeStoreId: "home" })).toEqual({
      type: "store",
      storeId: "other",
    });
  });

  it("falls back to another Holder when nothing is at a Store", () => {
    const portions = [portion({ whereaboutsType: "holder", holderId: "sam", count: 4 })];
    expect(defaultConfirmSource(portions, { dutyUserId: "tom", homeStoreId: "home" })).toEqual({
      type: "holder",
      holderId: "sam",
    });
  });

  it("ignores emptied-out Portions", () => {
    const portions = [
      portion({ whereaboutsType: "store", storeId: "home", count: 0 }),
      portion({ whereaboutsType: "store", storeId: "other", count: 4 }),
    ];
    expect(defaultConfirmSource(portions, { dutyUserId: "tom", homeStoreId: "home" })).toEqual({
      type: "store",
      storeId: "other",
    });
  });

  it("is undefined when there's nowhere to move it from", () => {
    expect(defaultConfirmSource([], { dutyUserId: "tom", homeStoreId: "home" })).toBeUndefined();
  });
});
