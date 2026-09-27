import { describe, expect, it } from "vitest";
import { RUGBY_POSITIONS } from "./positions";

describe("RUGBY_POSITIONS", () => {
  it("lists the thirteen positions from the spec, front row to full back", () => {
    expect(RUGBY_POSITIONS).toEqual([
      "Loosehead Prop",
      "Hooker",
      "Tighthead Prop",
      "Lock",
      "Blindside Flanker",
      "Openside Flanker",
      "Number 8",
      "Scrum-half",
      "Fly-half",
      "Inside Centre",
      "Outside Centre",
      "Wing",
      "Fullback",
    ]);
  });
});
