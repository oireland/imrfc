import { describe, expect, it } from "vitest";
import { eventIdInPath, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps a same-site path with its query", () => {
    expect(safeNextPath("/events/abc?tab=out")).toBe("/events/abc?tab=out");
  });

  it("falls back to Home for anything that could leave the site", () => {
    for (const bad of [null, "", "https://evil.com", "//evil.com", "/\\evil.com", "events/abc", "javascript:alert(1)"]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});

describe("eventIdInPath", () => {
  it("finds the Event a shared link points at", () => {
    expect(eventIdInPath("/events/abc-123?x=1")).toBe("abc-123");
    expect(eventIdInPath("/events")).toBeNull();
    expect(eventIdInPath("/equipment/abc")).toBeNull();
  });
});
