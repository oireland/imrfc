import { describe, expect, it } from "vitest";
import { joinNames } from "./names-rules";

describe("joinNames", () => {
  it("returns nothing for an empty list", () => {
    expect(joinNames([])).toBe("");
  });

  it("returns the one name as-is", () => {
    expect(joinNames(["Tom"])).toBe("Tom");
  });

  it("joins two names with &", () => {
    expect(joinNames(["Tom", "Sam"])).toBe("Tom & Sam");
  });

  it("joins three or more names with commas and a final &", () => {
    expect(joinNames(["Tom", "Sam", "Priya"])).toBe("Tom, Sam & Priya");
    expect(joinNames(["Tom", "Sam", "Priya", "Jo"])).toBe("Tom, Sam, Priya & Jo");
  });
});
