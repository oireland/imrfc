import { describe, expect, it } from "vitest";
import { validateLocation } from "./rules";

describe("validateLocation", () => {
  it("accepts a Location that is a Venue", () => {
    expect(
      validateLocation({ name: "Harlington", address: "Harlington, UB8", isVenue: true, isStore: false }),
    ).toEqual({ ok: true });
  });

  it("accepts a Location that is a Store", () => {
    expect(
      validateLocation({ name: "Kit shed", address: "Ethos, SW7", isVenue: false, isStore: true }),
    ).toEqual({ ok: true });
  });

  it("rejects a Location that is neither a Venue nor a Store", () => {
    expect(
      validateLocation({ name: "Somewhere", address: "SW7", isVenue: false, isStore: false }),
    ).toEqual({ ok: false, error: "A Location must be a Venue, a Store, or both." });
  });
});
