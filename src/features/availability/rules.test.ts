import { describe, expect, it } from "vitest";
import { mayReply, replyGroup, summarizeAvailability, validateReply, type Reply } from "./rules";

describe("validateReply", () => {
  it("needs a Reason for Not available", () => {
    expect(validateReply({ status: "not_available", note: "", reason: "  " })).toEqual({
      ok: false,
      error: "Say why you can't make it.",
    });
  });

  it("keeps a trimmed note on Available and drops any Reason", () => {
    expect(validateReply({ status: "available", note: " late ", reason: "x" })).toEqual({
      ok: true,
      reply: { status: "available", note: "late", reason: "" },
    });
  });
});

const players = [
  { id: "sam", name: "Sam", playing: true },
  { id: "jo", name: "Jo", playing: true },
  { id: "tom", name: "Tom", playing: true },
  { id: "ray", name: "Ray", playing: false },
];
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 12, minute));
const reply = (overrides: Partial<Reply>): Reply => ({
  userId: "sam",
  status: "available",
  note: "",
  reason: "",
  setById: "sam",
  createdAt: at(0),
  ...overrides,
});

describe("summarizeAvailability", () => {
  it("sorts Players into Available, Not available and No reply, using each one's latest reply", () => {
    const summary = summarizeAvailability({
      players,
      replies: [
        reply({ userId: "sam", status: "not_available", reason: "Exams", createdAt: at(0) }),
        reply({ userId: "sam", status: "available", note: "late", createdAt: at(5) }),
        reply({ userId: "jo", setById: "jo", status: "not_available", reason: "Injured", createdAt: at(1) }),
      ],
      viewer: { id: "tom", committee: true },
    });
    expect(summary.available.map((r) => [r.name, r.note])).toEqual([["Sam", "late"]]);
    expect(summary.notAvailable.map((r) => [r.name, r.reason])).toEqual([["Jo", "Injured"]]);
    expect(summary.noReply.map((r) => r.name)).toEqual(["Tom"]);
  });

  it("marks replies after the Reply By as late", () => {
    const summary = summarizeAvailability({
      players,
      replies: [reply({ userId: "sam", createdAt: at(10) }), reply({ userId: "jo", setById: "jo", createdAt: at(1) })],
      viewer: { id: "tom", committee: true },
      replyBy: at(5),
    });
    expect(summary.available.map((r) => [r.name, r.late])).toEqual([
      ["Jo", false],
      ["Sam", true],
    ]);
  });

  it("gives each No reply Player the time they were last nudged", () => {
    const summary = summarizeAvailability({
      players,
      replies: [],
      viewer: { id: "tom", committee: true },
      nudges: [
        { userId: "sam", createdAt: at(1) },
        { userId: "sam", createdAt: at(3) },
      ],
    });
    expect(summary.noReply.map((r) => [r.name, r.nudgedAt])).toEqual([
      ["Jo", null],
      ["Sam", at(3)],
      ["Tom", null],
    ]);
  });

  it("leaves out Players with Playing off, even if they replied", () => {
    const summary = summarizeAvailability({
      players,
      replies: [reply({ userId: "ray", setById: "ray" })],
      viewer: { id: "tom", committee: true },
    });
    expect([...summary.available, ...summary.notAvailable, ...summary.noReply].map((r) => r.name)).not.toContain("Ray");
  });

  it("shows Reasons only to Committee and to the Player themself", () => {
    const replies = [
      reply({ userId: "jo", setById: "jo", status: "not_available", reason: "Injured" }),
      reply({ userId: "sam", status: "not_available", reason: "Exams" }),
    ];
    const asSam = summarizeAvailability({ players, replies, viewer: { id: "sam", committee: false } });
    expect(asSam.notAvailable.map((r) => [r.name, r.reason])).toEqual([
      ["Jo", null],
      ["Sam", "Exams"],
    ]);
  });

  it("names who set a reply when it wasn't the Player", () => {
    const summary = summarizeAvailability({
      players,
      replies: [reply({ userId: "jo", setById: "tom" })],
      viewer: { id: "sam", committee: false },
    });
    expect(summary.available[0].setBy).toBe("Tom");
  });
});

describe("replyGroup", () => {
  const match = (id: string, start: string, overrides = {}) => ({ id, eventType: "match" as const, start: new Date(start), cancelled: false, ...overrides });

  it("makes one reply cover every Match that London day, open until the first kick-off", () => {
    const first = match("firsts", "2026-10-03T13:00:00Z");
    const seconds = match("seconds", "2026-10-03T15:00:00Z");
    // 00:30 on Sunday in London (BST) — a different day.
    const late = match("late", "2026-10-03T23:30:00Z");
    expect(replyGroup(seconds, [first, seconds, late])).toEqual({
      eventIds: ["firsts", "seconds"],
      closesAt: new Date("2026-10-03T13:00:00Z"),
    });
  });

  it("keeps Training on its own", () => {
    const training = { id: "t", eventType: "training" as const, start: new Date("2026-10-03T18:00:00Z"), cancelled: false };
    const sameDay = match("m", "2026-10-03T13:00:00Z");
    expect(replyGroup(training, [training, sameDay])).toEqual({ eventIds: ["t"], closesAt: training.start });
  });
});

describe("mayReply", () => {
  const open = { eventType: "match" as const, cancelled: false, closesAt: new Date("2026-10-03T13:00:00Z") };
  const now = new Date("2026-10-02T12:00:00Z");
  const sam = { id: "sam", playing: true };

  it("lets a Playing Player reply for themself until the Event starts", () => {
    expect(mayReply(open, { id: "sam", committee: false }, sam, now)).toBe(true);
    expect(mayReply(open, { id: "sam", committee: false }, sam, open.closesAt)).toBe(false);
  });

  it("lets Committee reply for another Playing Player, but not a Member", () => {
    expect(mayReply(open, { id: "tom", committee: true }, sam, now)).toBe(true);
    expect(mayReply(open, { id: "tom", committee: false }, sam, now)).toBe(false);
  });

  it("closes for Socials, Cancelled Events and Players with Playing off", () => {
    expect(mayReply({ ...open, eventType: "social" }, { id: "sam", committee: false }, sam, now)).toBe(false);
    expect(mayReply({ ...open, cancelled: true }, { id: "sam", committee: false }, sam, now)).toBe(false);
    expect(mayReply(open, { id: "tom", committee: true }, { id: "sam", playing: false }, now)).toBe(false);
  });
});
