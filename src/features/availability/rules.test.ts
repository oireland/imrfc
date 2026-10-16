import { describe, expect, it } from "vitest";
import { askStatus, mayReply, myReplies, replyGroup, seasonRecord, summarizeAvailability, validateReply, waitingOnReply, type Reply } from "./rules";

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

describe("summarizeAvailability — Not chased", () => {
  const notChased = new Map([
    ["sam", { kind: "away" as const, detail: "Exams" }],
    ["jo", { kind: "out" as const, detail: "Knee" }],
  ]);

  it("lists Not chased Players with no reply in their own group, not under No reply", () => {
    const summary = summarizeAvailability({ players, replies: [], viewer: { id: "tom", committee: true }, notChased });
    expect(summary.noReply.map((r) => r.name)).toEqual(["Tom"]);
    expect(summary.notChased.map((r) => [r.name, r.kind, r.detail])).toEqual([
      ["Jo", "out", "Knee"],
      ["Sam", "away", "Exams"],
    ]);
  });

  it("lets a reply win: an Away Player who says Available is Available", () => {
    const summary = summarizeAvailability({
      players,
      replies: [reply({ userId: "sam", status: "available", createdAt: at(1) })],
      viewer: { id: "tom", committee: true },
      notChased,
    });
    expect(summary.available.map((r) => r.name)).toEqual(["Sam"]);
    expect(summary.notChased.map((r) => r.name)).toEqual(["Jo"]);
  });

  it("shows other Members neither the group nor the cause, and still doesn't chase them", () => {
    const summary = summarizeAvailability({ players, replies: [], viewer: { id: "tom", committee: false }, notChased });
    expect(summary.notChased).toEqual([]);
    expect(summary.noReply.map((r) => r.name)).toEqual(["Tom"]);
  });

  it("leaves out Players with Playing off", () => {
    const summary = summarizeAvailability({
      players,
      replies: [],
      viewer: { id: "tom", committee: true },
      notChased: new Map([["ray", { kind: "away" as const, detail: "x" }]]),
    });
    expect(summary.notChased).toEqual([]);
  });
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

const ev = (id: string, eventType: "training" | "match", start: string, extra: { cancelled?: boolean; title?: string } = {}) => ({
  id,
  title: extra.title ?? id,
  eventType,
  start: new Date(start),
  cancelled: extra.cancelled ?? false,
});

describe("waitingOnReply", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("lists announced, still-open Events the Player hasn't replied to, soonest first", () => {
    const events = [
      ev("sat", "training", "2026-10-04T10:00:00Z"),
      ev("thu", "training", "2026-10-02T18:00:00Z"),
      ev("quiet", "training", "2026-10-03T18:00:00Z"),
    ];
    const asks = waitingOnReply({
      events,
      announcements: [
        { eventId: "sat", replyBy: null },
        { eventId: "thu", replyBy: new Date("2026-10-02T09:00:00Z") },
      ],
      repliedEventIds: new Set(),
      now,
    });
    expect(asks.map((a) => [a.eventId, a.replyBy])).toEqual([
      ["thu", new Date("2026-10-02T09:00:00Z")],
      ["sat", null],
    ]);
  });

  it("drops Events already replied to, started or Cancelled", () => {
    const asks = waitingOnReply({
      events: [
        ev("replied", "training", "2026-10-02T18:00:00Z"),
        ev("started", "training", "2026-10-01T11:00:00Z"),
        ev("off", "training", "2026-10-02T18:00:00Z", { cancelled: true }),
      ],
      announcements: ["replied", "started", "off"].map((eventId) => ({ eventId, replyBy: null })),
      repliedEventIds: new Set(["replied"]),
      now,
    });
    expect(asks).toEqual([]);
  });

  it("asks once for a day's Matches, answered by a reply to any of them", () => {
    const events = [
      ev("firsts", "match", "2026-10-03T13:00:00Z", { title: "1st XV v Barts" }),
      ev("seconds", "match", "2026-10-03T15:00:00Z", { title: "2nd XV v UCL" }),
    ];
    const announcements = [{ eventId: "seconds", replyBy: null }];
    const asks = waitingOnReply({ events, announcements, repliedEventIds: new Set(), now });
    expect(asks).toEqual([
      {
        eventId: "firsts",
        events: [
          { title: "1st XV v Barts", start: new Date("2026-10-03T13:00:00Z") },
          { title: "2nd XV v UCL", start: new Date("2026-10-03T15:00:00Z") },
        ],
        replyBy: null,
      },
    ]);
    expect(waitingOnReply({ events, announcements, repliedEventIds: new Set(["firsts"]), now })).toEqual([]);
  });
});

describe("seasonRecord", () => {
  const since = new Date("2026-08-31T23:00:00Z");
  const now = new Date("2026-10-10T12:00:00Z");
  const reply = (eventId: string, status: "available" | "not_available", at = "2026-09-01T00:00:00Z") => ({
    eventId,
    status,
    createdAt: new Date(at),
  });

  const zero = { available: 0, notAvailable: 0, noReply: 0 };

  it("counts each past Training and Match day this season by the latest reply, and the announced ones apart", () => {
    const record = seasonRecord({
      events: [
        ev("t1", "training", "2026-09-10T18:00:00Z"),
        ev("t2", "training", "2026-09-17T18:00:00Z"),
        ev("t3", "training", "2026-09-24T18:00:00Z"),
        ev("m1", "match", "2026-09-20T13:00:00Z"),
        ev("m2", "match", "2026-09-20T15:00:00Z"),
        ev("m3", "match", "2026-09-27T13:00:00Z"),
      ],
      replies: [
        reply("t1", "not_available"),
        reply("t1", "available", "2026-09-02T00:00:00Z"),
        reply("t2", "not_available"),
        reply("m2", "available"),
      ],
      announcedEventIds: new Set(["t1", "t3", "m1"]),
      since,
      now,
    });
    expect(record).toEqual({
      matches: { all: { available: 1, notAvailable: 0, noReply: 1 }, announced: { available: 1, notAvailable: 0, noReply: 0 } },
      training: { all: { available: 1, notAvailable: 1, noReply: 1 }, announced: { available: 1, notAvailable: 0, noReply: 1 } },
    });
  });

  it("leaves out last season, Events still to come, Cancelled Events and a day of only Cancelled Matches", () => {
    const record = seasonRecord({
      events: [
        ev("old", "training", "2026-08-20T18:00:00Z"),
        ev("soon", "training", "2026-10-12T18:00:00Z"),
        ev("off", "training", "2026-09-10T18:00:00Z", { cancelled: true }),
        ev("offMatch", "match", "2026-09-20T13:00:00Z", { cancelled: true }),
      ],
      replies: [],
      announcedEventIds: new Set(["old", "soon", "off", "offMatch"]),
      since,
      now,
    });
    expect(record).toEqual({
      matches: { all: zero, announced: zero },
      training: { all: zero, announced: zero },
    });
  });
});

describe("myReplies", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const mine = (eventId: string, status: "available" | "not_available", minute = 0) => ({ eventId, status, createdAt: at(minute) });

  it("gives each Training and Match the Player's latest reply, and whether they can still reply", () => {
    const replies = myReplies({
      events: [
        ev("tue", "training", "2026-10-06T18:00:00Z"),
        ev("thu", "training", "2026-10-08T18:00:00Z"),
        ev("done", "training", "2026-10-01T10:00:00Z"),
        ev("off", "training", "2026-10-09T18:00:00Z", { cancelled: true }),
      ],
      replies: [mine("tue", "not_available", 0), mine("tue", "available", 5)],
      playing: true,
      now,
    });
    expect(replies).toEqual({
      tue: { status: "available", open: true },
      thu: { status: null, open: true },
      done: { status: null, open: false },
      off: { status: null, open: false },
    });
  });

  it("shares one reply across a day's Matches, closing at the first one still going ahead", () => {
    const replies = myReplies({
      events: [
        ev("firsts", "match", "2026-10-03T13:00:00Z", { cancelled: true }),
        ev("seconds", "match", "2026-10-03T15:00:00Z"),
        ev("sunday", "match", "2026-10-04T15:00:00Z"),
      ],
      replies: [mine("firsts", "not_available")],
      playing: true,
      now,
    });
    expect(replies).toEqual({
      firsts: { status: "not_available", open: false },
      seconds: { status: "not_available", open: true },
      sunday: { status: null, open: true },
    });
  });

  it("leaves out Socials, and closes everything for a Player not playing", () => {
    const replies = myReplies({
      events: [ev("tue", "training", "2026-10-06T18:00:00Z"), { ...ev("drinks", "training", "2026-10-06T20:00:00Z"), eventType: "social" as const }],
      replies: [],
      playing: false,
      now,
    });
    expect(replies).toEqual({ tue: { status: null, open: false } });
  });
});

describe("askStatus", () => {
  const createdAt = new Date("2026-10-01T12:00:00Z");
  const later = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000);

  it("is sending until the emails have all been tried", () => {
    expect(askStatus({ createdAt, finishedAt: null, missed: 0 }, later(1))).toBe("sending");
  });

  it("is sent when everyone was reached, and failed when anyone wasn't", () => {
    expect(askStatus({ createdAt, finishedAt: later(1), missed: 0 }, later(2))).toBe("sent");
    expect(askStatus({ createdAt, finishedAt: later(1), missed: 2 }, later(2))).toBe("failed");
  });

  it("is failed if it's still sending 15 minutes on, since the send must have been cut off", () => {
    expect(askStatus({ createdAt, finishedAt: null, missed: 0 }, later(14))).toBe("sending");
    expect(askStatus({ createdAt, finishedAt: null, missed: 0 }, later(15))).toBe("failed");
  });
});

describe("a Match with a TBC kick-off", () => {
  // Saturday 3 Oct 2026 in London (BST): the day starts at 23:00Z on the 2nd.
  const tbc = { id: "tbc", eventType: "match" as const, start: new Date("2026-10-02T23:00:00Z"), cancelled: false, startTbc: true };
  const morning = new Date("2026-10-03T08:00:00Z");

  it("keeps replies open through match day rather than closing at midnight", () => {
    expect(replyGroup(tbc, []).closesAt).toEqual(new Date("2026-10-03T22:59:00Z"));
    expect(myReplies({ events: [tbc], replies: [], playing: true, now: morning })).toEqual({ tbc: { status: null, open: true } });
  });

  it("is still waiting on a reply on match day", () => {
    const asks = waitingOnReply({
      events: [{ ...tbc, title: "1st XV vs Barts" }],
      announcements: [{ eventId: "tbc", replyBy: null }],
      repliedEventIds: new Set(),
      now: morning,
    });
    expect(asks.map((a) => a.eventId)).toEqual(["tbc"]);
  });

  it("closes at the first timed kick-off when the day has one", () => {
    const timed = { id: "timed", eventType: "match" as const, start: new Date("2026-10-03T13:00:00Z"), cancelled: false };
    expect(replyGroup(tbc, [timed]).closesAt).toEqual(timed.start);
  });
});
