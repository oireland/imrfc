import { describe, expect, it } from "vitest";
import { classifyEvent, validateEvent, type NewEvent } from "./rules";

const training: NewEvent = {
  title: "Training",
  eventType: "training",
  start: new Date("2026-01-07T19:00:00Z"),
  end: new Date("2026-01-07T20:30:00Z"),
  venueId: "venue-1",
};

describe("validateEvent", () => {
  it("accepts a valid Training", () => {
    expect(validateEvent(training)).toEqual({ ok: true });
  });

  it("rejects an Event without a title", () => {
    expect(validateEvent({ ...training, title: "" })).toEqual({
      ok: false,
      error: "Give the event a title.",
    });
  });

  it("rejects an Event without a Venue", () => {
    expect(validateEvent({ ...training, venueId: "" })).toEqual({
      ok: false,
      error: "Choose a venue.",
    });
  });

  it("rejects an Event that ends before it starts", () => {
    expect(
      validateEvent({ ...training, start: new Date("2026-01-07T20:00:00Z"), end: new Date("2026-01-07T19:00:00Z") }),
    ).toEqual({ ok: false, error: "The event can't end before it starts." });
  });

  it("rejects a Match without an opponent", () => {
    const match: NewEvent = {
      ...training,
      eventType: "match",
      matchDetails: {
        opponent: "",
        homeAway: "home",
        competition: "bucs",
        meetTime: training.start,
      },
    };
    expect(validateEvent(match)).toEqual({ ok: false, error: "Who's the match against? Add an opponent." });
  });

  it("accepts a valid Match", () => {
    const match: NewEvent = {
      ...training,
      eventType: "match",
      matchDetails: {
        opponent: "UCL",
        homeAway: "home",
        competition: "bucs",
        meetTime: training.start,
      },
    };
    expect(validateEvent(match)).toEqual({ ok: true });
  });
});

describe("classifyEvent", () => {
  it("is Upcoming before the Event ends", () => {
    const now = new Date("2026-01-07T18:00:00Z");
    expect(classifyEvent({ end: training.end }, now)).toBe("upcoming");
  });

  it("is Past once the Event has ended", () => {
    const now = new Date("2026-01-08T00:00:00Z");
    expect(classifyEvent({ end: training.end }, now)).toBe("past");
  });
});
