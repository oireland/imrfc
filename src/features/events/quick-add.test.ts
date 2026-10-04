import { describe, expect, it } from "vitest";
import { buildQuickEvent, buildQuickSeries } from "./quick-add";

const base = { date: "2026-10-24", startTime: "19:00", endTime: "21:00", venue: "Harlington" };
const match = { ...base, type: "match" as const, startTime: "14:30", teamId: "1st XV", opponent: "UCL Medics" };

describe("buildQuickEvent", () => {
  it("turns London wall-clock times into UTC during BST", () => {
    const e = buildQuickEvent({ ...base, type: "training" });

    expect(e.start.toISOString()).toBe("2026-10-24T18:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-10-24T20:00:00.000Z");
  });

  it("turns London wall-clock times into UTC after the clocks go back", () => {
    const e = buildQuickEvent({ ...base, date: "2026-10-26", type: "training" });

    expect(e.start.toISOString()).toBe("2026-10-26T19:00:00.000Z");
  });

  it("gives a Training no title of its own", () => {
    expect(buildQuickEvent({ ...base, type: "training" })).not.toHaveProperty("title");
  });

  it("titles a Social by hand, trimmed", () => {
    const e = buildQuickEvent({ ...base, type: "social", title: " Curry night " });

    expect(e.eventType === "social" && e.title).toBe("Curry night");
  });

  it("ends the next day when the end time is before the start time", () => {
    const e = buildQuickEvent({ ...base, type: "social", title: "Pub", startTime: "20:00", endTime: "00:30" });

    expect(e.end.toISOString()).toBe("2026-10-24T23:30:00.000Z");
  });

  it("carries notes through, trimmed", () => {
    const e = buildQuickEvent({ ...base, type: "training", notes: " Bring bibs " });

    expect(e.notes).toBe("Bring bibs");
  });

  it("builds a Match from its Team and opponent, ending two hours after kick-off", () => {
    const e = buildQuickEvent({ ...match, homeAway: "away", competition: "bucs" });

    expect(e.start.toISOString()).toBe("2026-10-24T13:30:00.000Z");
    expect(e.end.toISOString()).toBe("2026-10-24T15:30:00.000Z");
    expect(e.startTbc).toBeFalsy();
    expect(e.eventType === "match" && e.matchDetails).toEqual({
      teamId: "1st XV",
      opponent: "UCL Medics",
      homeAway: "away",
      competition: "bucs",
    });
  });

  it("holds just the day for a Match whose kick-off is TBC", () => {
    const e = buildQuickEvent({ ...match, kickoffTbc: true });

    expect(e.startTbc).toBe(true);
    expect(e.start.toISOString()).toBe("2026-10-23T23:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-10-24T22:59:00.000Z");
  });

  it("leaves Meet Time and Travel Meet Time TBC unless given", () => {
    const e = buildQuickEvent(match);

    expect(e.eventType === "match" && e.matchDetails.meetTime).toBeUndefined();
    expect(e.eventType === "match" && e.matchDetails.travelMeetTime).toBeUndefined();
  });

  it("carries a meet time, travel meet time and point through for a Match, when given", () => {
    const e = buildQuickEvent({ ...match, meetTime: "13:00", travelMeetTime: "12:15", travelMeetPoint: "South Ken station" });

    expect(e.eventType === "match" && e.matchDetails.meetTime?.toISOString()).toBe("2026-10-24T12:00:00.000Z");
    expect(e.eventType === "match" && e.matchDetails.travelMeetTime?.toISOString()).toBe("2026-10-24T11:15:00.000Z");
    expect(e.eventType === "match" && e.matchDetails.travelMeetPoint).toBe("South Ken station");
  });
});

describe("buildQuickSeries", () => {
  it("repeats a Training weekly on the chosen date's weekday until the given date, with no title", () => {
    // 2026-10-24 is a Saturday.
    const s = buildQuickSeries({ ...base, type: "training", notes: " Bring bibs ", repeatUntil: "2026-12-10" });

    expect(s).toEqual({
      eventType: "training",
      weekdays: [6],
      startTime: "19:00",
      endTime: "21:00",
      venue: "Harlington",
      startDate: "2026-10-24",
      endDate: "2026-12-10",
      notes: "Bring bibs",
    });
  });

  it("also repeats a Social weekly, as a titled Social Series", () => {
    const s = buildQuickSeries({ ...base, type: "social", title: " Quiz ", repeatUntil: "2026-12-10" });

    expect(s.eventType).toBe("social");
    expect(s.title).toBe("Quiz");
  });
});
