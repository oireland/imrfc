import { describe, expect, it } from "vitest";
import { buildQuickEvent, buildQuickSeries } from "./quick-add";

const base = { date: "2026-10-24", startTime: "19:00", endTime: "21:00", venue: "Harlington", title: "" };

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

  it("names an untitled Event after its type", () => {
    expect(buildQuickEvent({ ...base, type: "social" }).title).toBe("Social");
    expect(buildQuickEvent({ ...base, type: "training", title: " Fitness " }).title).toBe("Fitness");
  });

  it("ends the next day when the end time is before the start time", () => {
    const e = buildQuickEvent({ ...base, type: "social", startTime: "20:00", endTime: "00:30" });

    expect(e.end.toISOString()).toBe("2026-10-24T23:30:00.000Z");
  });

  it("builds Match details, meeting at kick-off, titled after the opponent", () => {
    const e = buildQuickEvent({
      ...base,
      type: "match",
      startTime: "14:30",
      endTime: "16:30",
      opponent: "UCL Medics",
      homeAway: "away",
      competition: "bucs",
    });

    expect(e.title).toBe("vs UCL Medics");
    expect(e.eventType === "match" && e.matchDetails).toEqual({
      opponent: "UCL Medics",
      homeAway: "away",
      competition: "bucs",
      meetTime: e.start,
    });
  });

  it("carries notes and Teams through, trimming the notes", () => {
    const e = buildQuickEvent({ ...base, type: "training", notes: " Bring bibs ", teamIds: ["t1", "t2"] });

    expect(e.notes).toBe("Bring bibs");
    expect(e.teamIds).toEqual(["t1", "t2"]);
  });

  it("uses a separate meet time for a Match when one is given", () => {
    const e = buildQuickEvent({ ...base, type: "match", startTime: "14:30", endTime: "16:30", meetTime: "13:00" });

    expect(e.eventType === "match" && e.matchDetails.meetTime.toISOString()).toBe("2026-10-24T12:00:00.000Z");
  });
});

describe("buildQuickSeries", () => {
  it("repeats weekly on the chosen date's weekday until the given date", () => {
    // 2026-10-24 is a Saturday.
    const s = buildQuickSeries({
      ...base,
      type: "training",
      title: " Fitness ",
      notes: " Bring bibs ",
      teamIds: ["t1"],
      repeatUntil: "2026-12-10",
    });

    expect(s).toEqual({
      title: "Fitness",
      weekdays: [6],
      startTime: "19:00",
      endTime: "21:00",
      venue: "Harlington",
      startDate: "2026-10-24",
      endDate: "2026-12-10",
      notes: "Bring bibs",
      teamIds: ["t1"],
    });
  });

  it("names an untitled Series Training", () => {
    expect(buildQuickSeries({ ...base, type: "training", repeatUntil: "2026-12-10" }).title).toBe("Training");
  });
});
