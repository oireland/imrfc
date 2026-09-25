import { describe, expect, it } from "vitest";
import { displayName } from "./display-name";

describe("displayName", () => {
  it("uses the User's name", () => {
    expect(displayName({ name: "Ollie Ireland", email: "ollie@example.com" })).toBe("Ollie Ireland");
  });

  it("falls back to the email's local part when the name is blank", () => {
    expect(displayName({ name: "  ", email: "ollie.ireland@example.com" })).toBe("ollie.ireland");
  });
});
