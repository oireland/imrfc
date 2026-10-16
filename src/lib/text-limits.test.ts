import { describe, expect, it } from "vitest";
import { LIMITS, firstTooLong } from "./text-limits";

describe("firstTooLong", () => {
  it("is null when everything fits, ignoring missing values", () => {
    expect(firstTooLong([["name", "Tom", LIMITS.name], ["note", undefined, LIMITS.note], ["x", null, 1]])).toBeNull();
  });

  it("allows text of exactly the limit", () => {
    expect(firstTooLong([["name", "a".repeat(LIMITS.name), LIMITS.name]])).toBeNull();
  });

  it("names the first field that is too long and the limit, in plain words", () => {
    const error = firstTooLong([["name", "ok", LIMITS.name], ["note", "a".repeat(LIMITS.note + 1), LIMITS.note]]);
    expect(error).toBe(`The note is too long. Keep it to ${LIMITS.note} characters or fewer.`);
  });

  it("measures after trimming", () => {
    expect(firstTooLong([["name", ` ${"a".repeat(LIMITS.name)} `, LIMITS.name]])).toBeNull();
  });
});
