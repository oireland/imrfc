import { describe, expect, it } from "vitest";
import { classifyEvent, eventTitle, startsAt, validateEvent, type NewEvent } from "./rules";

const training: NewEvent = {
  eventType: "training",
  start: new Date("2026-01-07T19:00:00Z"),
  end: new Date("2026-01-07T20:30:00Z"),
  venue: "Harlington",
};

describe("validateEvent", () => {
  it("accepts a valid Training", () => {
    expect(validateEvent(training)).toEqual({ ok: true });
  });

  it("rejects a Social without a title", () => {
    expect(validateEvent({ ...training, eventType: "social", title: " " })).toEqual({
      ok: false,
      error: "Give the event a title.",
    });
  });

  it("rejects an Event without a Venue", () => {
    expect(validateEvent({ ...training, venue: " " })).toEqual({
      ok: false,
      error: "Where is it? Add a venue.",
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
        teamId: "1st XV",
        opponent: "",
        homeAway: "home",
        competition: "bucs",
        meetTime: training.start,
      },
    };
    expect(validateEvent(match)).toEqual({ ok: false, error: "Who's the match against? Add an opponent." });
  });

  it("rejects a Match without a Team", () => {
    const match: NewEvent = {
      ...training,
      eventType: "match",
      matchDetails: { teamId: " ", opponent: "UCL", homeAway: "home", competition: "bucs" },
    };
    expect(validateEvent(match)).toEqual({ ok: false, error: "Which team is playing? Pick a team." });
  });

  it("accepts a Match whose times are all still TBC", () => {
    const match: NewEvent = {
      ...training,
      eventType: "match",
      startTbc: true,
      matchDetails: { teamId: "1st XV", opponent: "UCL", homeAway: "away", competition: "bucs" },
    };
    expect(validateEvent(match)).toEqual({ ok: true });
  });

  it("accepts a valid Match", () => {
    const match: NewEvent = {
      ...training,
      eventType: "match",
      matchDetails: {
        teamId: "1st XV",
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

describe("eventTitle", () => {
  it("calls a Training 'Training @ Location'", () => {
    expect(eventTitle(training)).toBe("Training @ Harlington");
  });

  it("calls a Match 'Team vs Opponent'", () => {
    const match: NewEvent = {
      ...training,
      eventType: "match",
      matchDetails: { teamId: "1st XV", opponent: " St Georges ", homeAway: "home", competition: "friendly" },
    };
    expect(eventTitle(match, "1st XV")).toBe("1st XV vs St Georges");
  });

  it("keeps a Social's own title", () => {
    expect(eventTitle({ ...training, eventType: "social", title: " Curry night " })).toBe("Curry night");
  });
});

describe("startsAt", () => {
  it("is the start for an Event with a known time", () => {
    const start = new Date("2026-10-03T13:00:00Z");
    expect(startsAt({ start })).toEqual(start);
    expect(startsAt({ start, startTbc: false })).toEqual(start);
  });

  it("is the end of the London day for a TBC kick-off, not midnight", () => {
    // 3 Oct 2026 is BST: London midnight is 23:00Z the day before, 23:59 London is 22:59Z.
    expect(startsAt({ start: new Date("2026-10-02T23:00:00Z"), startTbc: true })).toEqual(new Date("2026-10-03T22:59:00Z"));
    // 31 Oct 2026 is GMT.
    expect(startsAt({ start: new Date("2026-11-01T00:00:00Z"), startTbc: true })).toEqual(new Date("2026-11-01T23:59:00Z"));
  });
});
