import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-error";

describe("signInErrorMessage", () => {
  it("says a dead link needs a new one", () => {
    expect(signInErrorMessage("INVALID_TOKEN")).toMatch(/expired or already been used/);
  });

  it("falls back to a general message for any other error", () => {
    expect(signInErrorMessage("failed_to_create_session")).toMatch(/Something went wrong/);
  });

  it("has nothing to say without an error", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
  });
});
