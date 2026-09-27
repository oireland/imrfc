import { describe, expect, it } from "vitest";
import { needsOnboarding } from "./needs-onboarding";

describe("needsOnboarding", () => {
  it("is true for a User with no name and no Preferred Position", () => {
    expect(needsOnboarding({ name: "", preferredPosition: null })).toBe(true);
  });

  it("is true when only the name is missing", () => {
    expect(needsOnboarding({ name: "  ", preferredPosition: "Hooker" })).toBe(true);
  });

  it("is true when only the Preferred Position is missing", () => {
    expect(needsOnboarding({ name: "Ollie Ireland", preferredPosition: null })).toBe(true);
  });

  it("is false once both a name and a Preferred Position are set", () => {
    expect(needsOnboarding({ name: "Ollie Ireland", preferredPosition: "Hooker" })).toBe(false);
  });
});
