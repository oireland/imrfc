import { describe, expect, it } from "vitest";
import { parseSourceValue, sourceValue } from "./source-value";

describe("source option values", () => {
  it("round-trips every kind of Place, keeping Unconfirmed apart from the Store", () => {
    const places = [
      { type: "store", storeId: "shed" },
      { type: "holder", holderId: "tom" },
      { type: "unconfirmed", lastSeenEventId: "e1" },
    ] as const;
    for (const place of places) expect(parseSourceValue(sourceValue(place))).toEqual(place);
    expect(new Set(places.map(sourceValue)).size).toBe(3);
  });
});
