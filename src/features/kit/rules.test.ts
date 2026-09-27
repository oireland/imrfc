import { describe, expect, it } from "vitest";
import { validateKitUnit } from "./rules";

describe("validateKitUnit", () => {
  it("accepts a Kit Unit with a name and a Home", () => {
    expect(validateKitUnit({ name: "Ball bag A", homeId: "loc-1" })).toEqual({ ok: true });
  });

  it("rejects a Kit Unit without a name", () => {
    expect(validateKitUnit({ name: "", homeId: "loc-1" })).toEqual({
      ok: false,
      error: "Give the kit a name.",
    });
  });

  it("rejects a Kit Unit without a Home", () => {
    expect(validateKitUnit({ name: "Ball bag A", homeId: "" })).toEqual({
      ok: false,
      error: "Choose where the kit lives.",
    });
  });

  it("accepts a Kit Unit with a Quantity of more than 1", () => {
    expect(validateKitUnit({ name: "Tackle shields", homeId: "loc-1", quantity: 8 })).toEqual({ ok: true });
  });

  it("rejects a Quantity below 1", () => {
    expect(validateKitUnit({ name: "Tackle shields", homeId: "loc-1", quantity: 0 })).toEqual({
      ok: false,
      error: "Quantity must be at least 1.",
    });
  });
});
