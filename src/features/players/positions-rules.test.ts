import { describe, expect, it } from "vitest";
import { normalizePositions } from "./positions-rules";

describe("normalizePositions", () => {
  it("drops the Preferred Position from Other Positions if it's repeated there", () => {
    expect(normalizePositions("Hooker", ["Hooker", "Lock"])).toEqual({ preferred: "Hooker", other: ["Lock"] });
  });

  it("deduplicates Other Positions", () => {
    expect(normalizePositions("Hooker", ["Lock", "Lock"])).toEqual({ preferred: "Hooker", other: ["Lock"] });
  });
});
