import { describe, expect, it } from "vitest";
import { effectiveCount, resolveChecklist } from "./rules";

describe("resolveChecklist", () => {
  it("prefers the Event's own Checklist over Series and Default", () => {
    expect(
      resolveChecklist({
        event: [{ equipmentUnitId: "a", count: null }],
        series: [{ equipmentUnitId: "b", count: null }],
        default: [{ equipmentUnitId: "c", count: null }],
      }),
    ).toEqual({
      source: "event",
      items: [{ equipmentUnitId: "a", count: null }],
    });
  });

  it("falls back to the Series Checklist, then the Default Checklist", () => {
    expect(
      resolveChecklist({ series: [{ equipmentUnitId: "b", count: null }], default: [{ equipmentUnitId: "c", count: null }] }),
    ).toEqual({
      source: "series",
      items: [{ equipmentUnitId: "b", count: null }],
    });
    expect(resolveChecklist({ default: [{ equipmentUnitId: "c", count: null }] })).toEqual({
      source: "default",
      items: [{ equipmentUnitId: "c", count: null }],
    });
  });

  it("treats an empty override as an override", () => {
    expect(resolveChecklist({ event: [], default: [{ equipmentUnitId: "c", count: null }] })).toEqual({
      source: "event",
      items: [],
    });
  });

  it("is empty when no level has a Checklist", () => {
    expect(resolveChecklist({})).toEqual({ source: "none", items: [] });
  });
});

describe("effectiveCount", () => {
  it("is the whole Quantity when the line asks for all of them", () => {
    expect(effectiveCount(null, 8)).toBe(8);
  });

  it("is the explicit count when it's within the Quantity", () => {
    expect(effectiveCount(4, 8)).toBe(4);
  });

  it("is capped at the current Quantity when the line asks for more", () => {
    expect(effectiveCount(6, 4)).toBe(4);
  });
});
