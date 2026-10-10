import { describe, expect, it } from "vitest";
import {
  checkInFlag,
  injuryLine,
  isWorse,
  notChasedFor,
  statusAlert,
  validateReport,
  validateUpdate,
  worstFitness,
  type ReportInput,
} from "./rules";

const today = "2026-10-10";

const report = (overrides: Partial<ReportInput> = {}): ReportInput => ({
  area: "Thigh",
  description: "Pulled it sprinting",
  happenedOn: "2026-09-21",
  eventId: null,
  status: "training_only",
  expectedReturn: "2026-10-20",
  notSure: false,
  needsPhysio: true,
  physioNote: "Strapping",
  ...overrides,
});

describe("worstFitness", () => {
  it("is the worst of the open statuses: Out, else Training only, else Playing through it, else Fit", () => {
    expect(worstFitness(["playing_through", "out", "training_only"])).toBe("out");
    expect(worstFitness(["playing_through", "training_only"])).toBe("training_only");
    expect(worstFitness(["playing_through"])).toBe("playing_through");
    expect(worstFitness([])).toBe("fit");
  });
});

describe("isWorse", () => {
  it("counts a new Injury, and any move towards Out", () => {
    expect(isWorse(null, "playing_through")).toBe(true);
    expect(isWorse("playing_through", "training_only")).toBe(true);
    expect(isWorse("training_only", "out")).toBe(true);
  });

  it("is not worse for the same status or getting better", () => {
    expect(isWorse("out", "out")).toBe(false);
    expect(isWorse("out", "training_only")).toBe(false);
    expect(isWorse("training_only", "playing_through")).toBe(false);
  });
});

describe("validateReport", () => {
  it("accepts a full report, trimming text", () => {
    const result = validateReport(report({ description: "  Pulled it  " }), today);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ description: "Pulled it", area: "Thigh", expectedReturn: "2026-10-20" }) });
  });

  it("needs a body area", () => {
    expect(validateReport(report({ area: "" as never }), today)).toEqual({ ok: false, error: "Pick where it hurts." });
  });

  it("needs an Expected Return or Not sure yet, so skipping is a visible choice", () => {
    expect(validateReport(report({ expectedReturn: null }), today)).toEqual({
      ok: false,
      error: "Pick when you expect to be back, or say you're not sure yet.",
    });
    const unsure = validateReport(report({ expectedReturn: null, notSure: true }), today);
    expect(unsure).toEqual({ ok: true, value: expect.objectContaining({ expectedReturn: null }) });
  });

  it("drops a date picked alongside Not sure yet", () => {
    const result = validateReport(report({ notSure: true, expectedReturn: "2026-10-20" }), today);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ expectedReturn: null }) });
  });

  it("won't take a date that has already passed, or a start in the future", () => {
    expect(validateReport(report({ expectedReturn: "2026-10-09" }), today).ok).toBe(false);
    expect(validateReport(report({ happenedOn: "2026-10-11" }), today)).toEqual({ ok: false, error: "That hasn't happened yet." });
  });

  it("offers Needs physio on Training only and Playing through it, not Out", () => {
    const out = validateReport(report({ status: "out", needsPhysio: true, physioNote: "x" }), today);
    expect(out).toEqual({ ok: true, value: expect.objectContaining({ needsPhysio: false, physioNote: "" }) });
    const training = validateReport(report({ physioNote: "  Strapping " }), today);
    expect(training).toEqual({ ok: true, value: expect.objectContaining({ needsPhysio: true, physioNote: "Strapping" }) });
  });

  it("clears the physio note when Needs physio is unticked", () => {
    const result = validateReport(report({ needsPhysio: false, physioNote: "Strapping" }), today);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ needsPhysio: false, physioNote: "" }) });
  });
});

describe("validateUpdate", () => {
  const update = { status: "playing_through" as const, expectedReturn: "2026-10-20", notSure: false, needsPhysio: false, physioNote: "", note: "  Jogged 5k " };

  it("accepts any open status and trims the progress note", () => {
    expect(validateUpdate(update, today)).toEqual({ ok: true, value: expect.objectContaining({ status: "playing_through", note: "Jogged 5k" }) });
  });

  it("asks for a fresh date when the old one has passed", () => {
    expect(validateUpdate({ ...update, expectedReturn: "2026-10-01" }, today).ok).toBe(false);
  });
});

describe("checkInFlag", () => {
  it("flags an Expected Return that has passed", () => {
    expect(checkInFlag({ status: "out", expectedReturn: "2026-10-09", happenedOn: "2026-09-21" }, today)).toBe("Due back 9 Oct, check in");
  });

  it("flags one with no Expected Return open over 4 weeks, naming the status", () => {
    expect(checkInFlag({ status: "out", expectedReturn: null, happenedOn: "2026-09-05" }, today)).toBe("Out 5 weeks, check in");
    expect(checkInFlag({ status: "training_only", expectedReturn: null, happenedOn: "2026-09-05" }, today)).toBe("Training only 5 weeks, check in");
    expect(checkInFlag({ status: "playing_through", expectedReturn: null, happenedOn: "2026-09-05" }, today)).toBe(
      "Playing through it 5 weeks, check in",
    );
  });

  it("has no flag otherwise", () => {
    expect(checkInFlag({ status: "out", expectedReturn: null, happenedOn: "2026-09-20" }, today)).toBeNull();
    expect(checkInFlag({ status: "out", expectedReturn: "2026-10-10", happenedOn: "2026-09-01" }, today)).toBeNull();
  });
});

describe("injuryLine", () => {
  it("names the worst Injury's status and area, counting the others", () => {
    const injuries = [
      { status: "playing_through" as const, area: "Shoulder" as const },
      { status: "out" as const, area: "Ankle" as const },
      { status: "out" as const, area: "Back" as const },
    ];
    expect(injuryLine(injuries)).toBe("Out · ankle (+2)");
    expect(injuryLine([injuries[0]])).toBe("Playing through it · shoulder");
  });
});

describe("notChasedFor", () => {
  it("doesn't chase Out for anything, Training only for Matches only", () => {
    expect(notChasedFor("out", "training")).toBe(true);
    expect(notChasedFor("out", "match")).toBe(true);
    expect(notChasedFor("training_only", "training")).toBe(false);
    expect(notChasedFor("training_only", "match")).toBe(true);
  });

  it("chases Playing through it and Fit", () => {
    expect(notChasedFor("playing_through", "match")).toBe(false);
    expect(notChasedFor("fit", "match")).toBe(false);
  });
});

describe("statusAlert", () => {
  it("is the name and new state only", () => {
    expect(statusAlert("Jo King", "out")).toBe("Jo King is now Out");
    expect(statusAlert("Jo King", "training_only")).toBe("Jo King is now Training only");
    expect(statusAlert("Jo King", "playing_through")).toBe("Jo King is now Playing through it");
  });
});
