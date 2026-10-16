import { describe, expect, it } from "vitest";
import { validateEquipmentUnit } from "./rules";

describe("validateEquipmentUnit", () => {
  it("accepts an Equipment Unit with a name and a Home", () => {
    expect(validateEquipmentUnit({ name: "Ball bag A", homeId: "loc-1" })).toEqual({ ok: true });
  });

  it("rejects an Equipment Unit without a name", () => {
    expect(validateEquipmentUnit({ name: "", homeId: "loc-1" })).toEqual({
      ok: false,
      error: "Give the equipment a name.",
    });
  });

  it("rejects an Equipment Unit without a Home", () => {
    expect(validateEquipmentUnit({ name: "Ball bag A", homeId: "" })).toEqual({
      ok: false,
      error: "Choose where the equipment lives.",
    });
  });

  it("accepts an Equipment Unit with a Quantity of more than 1", () => {
    expect(validateEquipmentUnit({ name: "Tackle shields", homeId: "loc-1", quantity: 8 })).toEqual({ ok: true });
  });

  it("rejects a Quantity below 1", () => {
    expect(validateEquipmentUnit({ name: "Tackle shields", homeId: "loc-1", quantity: 0 })).toEqual({
      ok: false,
      error: "Quantity must be at least 1.",
    });
  });
});

describe("validateEquipmentUnit length limit", () => {
  it("rejects a name that's far too long", () => {
    expect(validateEquipmentUnit({ name: "a".repeat(101), homeId: "loc-1" })).toEqual({
      ok: false,
      error: "The name is too long. Keep it to 100 characters or fewer.",
    });
  });
});
