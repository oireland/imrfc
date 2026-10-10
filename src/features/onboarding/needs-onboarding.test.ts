import { describe, expect, it } from "vitest";
import { needsOnboarding } from "./needs-onboarding";

const onboarded = { name: "Ollie Ireland", preferredPosition: "Hooker", playing: true, hasMobileNumber: true };

describe("needsOnboarding", () => {
  it("is true for a User with no name and no Preferred Position", () => {
    expect(needsOnboarding({ ...onboarded, name: "", preferredPosition: null })).toBe(true);
  });

  it("is true when only the name is missing", () => {
    expect(needsOnboarding({ ...onboarded, name: "  " })).toBe(true);
  });

  it("is true when only the Preferred Position is missing", () => {
    expect(needsOnboarding({ ...onboarded, preferredPosition: null })).toBe(true);
  });

  it("is true for a User who's Playing but has no Mobile number", () => {
    expect(needsOnboarding({ ...onboarded, hasMobileNumber: false })).toBe(true);
  });

  it("doesn't ask a User who isn't Playing for a Mobile number", () => {
    expect(needsOnboarding({ ...onboarded, playing: false, hasMobileNumber: false })).toBe(false);
  });

  it("is false once the name, Preferred Position and (for Players) Mobile number are set", () => {
    expect(needsOnboarding(onboarded)).toBe(false);
  });
});
