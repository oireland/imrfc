import { describe, expect, it } from "vitest";
import { joinList } from "./join-names";

describe("joinList", () => {
  it("is empty for no items", () => {
    expect(joinList([])).toBe("");
    expect(joinList([], "and")).toBe("");
  });
  it("is just the item for one", () => {
    expect(joinList(["Tom"])).toBe("Tom");
    expect(joinList(["Tom"], "and")).toBe("Tom");
  });
  it("joins two with the joiner", () => {
    expect(joinList(["Tom", "Sam"])).toBe("Tom & Sam");
    expect(joinList(["Tom", "Sam"], "and")).toBe("Tom and Sam");
  });
  it("uses commas then the joiner for three or more", () => {
    expect(joinList(["Tom", "Sam", "Priya"])).toBe("Tom, Sam & Priya");
    expect(joinList(["Tom", "Sam", "Priya", "Jo"])).toBe("Tom, Sam, Priya & Jo");
    expect(joinList(["Tom", "Sam", "Priya"], "and")).toBe("Tom, Sam and Priya");
  });
});
