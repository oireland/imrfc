import { describe, expect, it } from "vitest";
import { mapsSearchUrl } from "./maps";

describe("mapsSearchUrl", () => {
  it("searches Google Maps for a typed-in venue", () => {
    expect(mapsSearchUrl("Harlington Sports Ground, UB3 5AB")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Harlington%20Sports%20Ground%2C%20UB3%205AB",
    );
  });
});
