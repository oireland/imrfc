import { describe, expect, it } from "vitest";
import { comingUpSearch, readComingUpView } from "./coming-up-view";

describe("readComingUpView", () => {
  it("defaults to the Calendar with every Event Type", () => {
    expect(readComingUpView(new URLSearchParams())).toEqual({ view: "calendar", type: null });
  });

  it("reads the Agenda and an Event Type from the query", () => {
    expect(readComingUpView(new URLSearchParams("view=agenda&type=match"))).toEqual({ view: "agenda", type: "match" });
  });

  it("ignores values it doesn't know", () => {
    expect(readComingUpView(new URLSearchParams("view=list&type=gym"))).toEqual({ view: "calendar", type: null });
  });
});

describe("comingUpSearch", () => {
  it("writes only what differs from the defaults, keeping other params", () => {
    const current = new URLSearchParams("tab=x&view=agenda");
    expect(comingUpSearch(current, { view: "calendar", type: null })).toBe("?tab=x");
    expect(comingUpSearch(current, { view: "agenda", type: "training" })).toBe("?tab=x&view=agenda&type=training");
  });

  it("is empty when everything is at its default", () => {
    expect(comingUpSearch(new URLSearchParams("view=agenda"), { view: "calendar", type: null })).toBe("");
  });
});
