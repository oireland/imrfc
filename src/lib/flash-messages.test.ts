import { describe, expect, it } from "vitest";
import { errorMessage } from "./flash-messages";

describe("errorMessage", () => {
  it("turns a known error code into its message", () => {
    expect(errorMessage("block-self")).toBe("You can't block yourself.");
  });

  it("never echoes text it doesn't recognise", () => {
    expect(errorMessage("Your account has been suspended, call 0800 123")).toBe("Something went wrong. Please try again.");
  });

  it("doesn't mistake object properties for codes", () => {
    expect(errorMessage("constructor")).toBe("Something went wrong. Please try again.");
  });
});
