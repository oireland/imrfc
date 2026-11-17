import { describe, expect, it } from "vitest";
import { awayLabel, awayPushMessage, groupAway, imBackUntil, periodState, rangeLabel, validateAway, type AwayPeriod } from "./away-rules";

const period = (overrides: Partial<AwayPeriod>): AwayPeriod => ({
  id: "a1",
  userId: "sam",
  from: "2026-11-03",
  until: "2026-11-20",
  reason: "Exams",
  setById: "sam",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  ...overrides,
});

describe("validateAway", () => {
  const today = "2026-10-10";

  it("accepts dates and a Reason, trimming the Reason", () => {
    expect(validateAway({ from: "2026-11-03", until: "2026-11-20", reason: "  Exams " }, today)).toEqual({
      ok: true,
      value: { from: "2026-11-03", until: "2026-11-20", reason: "Exams" },
    });
  });

  it("needs a Reason", () => {
    expect(validateAway({ from: "2026-11-03", until: "2026-11-20", reason: " " }, today)).toEqual({
      ok: false,
      error: "Say why you'll be away.",
    });
  });

  it("needs both dates, so nobody is stuck Away", () => {
    expect(validateAway({ from: "2026-11-03", until: "", reason: "Exams" }, today)).toEqual({
      ok: false,
      error: "Pick the day you'll be back.",
    });
    expect(validateAway({ from: "", until: "2026-11-20", reason: "Exams" }, today)).toEqual({
      ok: false,
      error: "Pick the day you go away.",
    });
  });

  it("can't end before it starts", () => {
    expect(validateAway({ from: "2026-11-20", until: "2026-11-03", reason: "Exams" }, today).ok).toBe(false);
  });

  it("can't be wholly in the past", () => {
    expect(validateAway({ from: "2026-09-01", until: "2026-10-09", reason: "Exams" }, today)).toEqual({
      ok: false,
      error: "That's already over.",
    });
  });

  it("allows one starting before today that is still running", () => {
    expect(validateAway({ from: "2026-10-01", until: "2026-10-10", reason: "Exams" }, today).ok).toBe(true);
  });
});

describe("periodState", () => {
  it("is future before it starts, current from the first to the last day, past after", () => {
    const p = period({ from: "2026-11-03", until: "2026-11-20" });
    expect(periodState(p, "2026-11-02")).toBe("future");
    expect(periodState(p, "2026-11-03")).toBe("current");
    expect(periodState(p, "2026-11-20")).toBe("current");
    expect(periodState(p, "2026-11-21")).toBe("past");
  });
});

describe("groupAway", () => {
  it("splits periods into current, future (soonest first) and past (latest first)", () => {
    const today = "2026-11-10";
    const current = period({ id: "c", from: "2026-11-03", until: "2026-11-20" });
    const soon = period({ id: "f1", from: "2026-12-01", until: "2026-12-05" });
    const later = period({ id: "f2", from: "2027-01-01", until: "2027-01-05" });
    const old = period({ id: "p1", from: "2026-09-01", until: "2026-09-05" });
    const newer = period({ id: "p2", from: "2026-10-01", until: "2026-10-05" });
    const grouped = groupAway([later, old, current, newer, soon], today);
    expect(grouped.current.map((p) => p.id)).toEqual(["c"]);
    expect(grouped.future.map((p) => p.id)).toEqual(["f1", "f2"]);
    expect(grouped.past.map((p) => p.id)).toEqual(["p2", "p1"]);
  });
});

describe("imBackUntil", () => {
  it("is yesterday", () => {
    expect(imBackUntil("2026-11-01")).toBe("2026-10-31");
  });
});

describe("awayLabel", () => {
  const today = "2026-11-10";

  it("says Away until for the current period", () => {
    expect(awayLabel([period({ from: "2026-11-03", until: "2026-11-20" })], today)).toBe("Away until 20 Nov");
  });

  it("says Away from for the next future period when none is current", () => {
    expect(awayLabel([period({ from: "2026-12-20", until: "2027-01-05" })], today)).toBe("Away from 20 Dec");
  });

  it("prefers the current period over a future one", () => {
    const periods = [period({ id: "f", from: "2026-12-20", until: "2027-01-05" }), period({ id: "c", from: "2026-11-03", until: "2026-11-20" })];
    expect(awayLabel(periods, today)).toBe("Away until 20 Nov");
  });

  it("is null with nothing current or coming", () => {
    expect(awayLabel([period({ from: "2026-09-01", until: "2026-09-05" })], today)).toBeNull();
  });
});

describe("awayPushMessage", () => {
  const today = "2026-10-10";

  it("tells Committee someone is away until a date when it has started", () => {
    expect(awayPushMessage({ name: "Jo King", from: "2026-10-10", until: "2026-11-03" }, today)).toBe("Jo King is away until 3 Nov");
  });

  it("says will be away from a date when it starts within 14 days", () => {
    expect(awayPushMessage({ name: "Jo King", from: "2026-10-24", until: "2026-11-03" }, today)).toBe("Jo King will be away from 24 Oct");
  });

  it("is silent for one starting further off", () => {
    expect(awayPushMessage({ name: "Jo King", from: "2026-10-25", until: "2026-11-03" }, today)).toBeNull();
  });
});

describe("rangeLabel", () => {
  it("writes the dates as a range", () => {
    expect(rangeLabel("2026-12-20", "2027-01-05")).toBe("20 Dec – 5 Jan");
  });

  it("is a single day when they match", () => {
    expect(rangeLabel("2026-11-03", "2026-11-03")).toBe("3 Nov");
  });
});

describe("validateAway length limit", () => {
  it("rejects a Reason that's far too long", () => {
    const result = validateAway({ from: "2026-11-03", until: "2026-11-20", reason: "a".repeat(201) }, "2026-10-10");
    expect(result).toEqual({ ok: false, error: "The reason is too long. Keep it to 200 characters or fewer." });
  });
});
