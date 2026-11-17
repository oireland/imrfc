import { describe, expect, it } from "vitest";
import { othersOnDuty } from "./others-on-duty";

const name = (id: string) => ({ me: "Me", sam: "Sam", priya: "Priya", tom: "Tom" })[id] ?? "Someone";

describe("othersOnDuty", () => {
  it("is null when the viewer is alone on the Duty", () => {
    expect(othersOnDuty(["me"], "me", name)).toBeNull();
  });
  it("names one other", () => {
    expect(othersOnDuty(["me", "sam"], "me", name)).toBe("with Sam");
  });
  it("names several others, leaving the viewer out", () => {
    expect(othersOnDuty(["sam", "me", "priya", "tom"], "me", name)).toBe("with Sam, Priya & Tom");
  });
});
