import { describe, expect, it } from "vitest";
import { resolveChecklist } from "./rules";

describe("resolveChecklist", () => {
  it("prefers the Event's own Checklist over Series and Default", () => {
    expect(resolveChecklist({ event: ["a"], series: ["b"], default: ["c"] })).toEqual({
      source: "event",
      kitUnitIds: ["a"],
    });
  });

  it("falls back to the Series Checklist, then the Default Checklist", () => {
    expect(resolveChecklist({ series: ["b"], default: ["c"] })).toEqual({
      source: "series",
      kitUnitIds: ["b"],
    });
    expect(resolveChecklist({ default: ["c"] })).toEqual({ source: "default", kitUnitIds: ["c"] });
  });

  it("treats an empty override as an override", () => {
    expect(resolveChecklist({ event: [], default: ["c"] })).toEqual({
      source: "event",
      kitUnitIds: [],
    });
  });

  it("is empty when no level has a Checklist", () => {
    expect(resolveChecklist({})).toEqual({ source: "none", kitUnitIds: [] });
  });
});
