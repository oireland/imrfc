import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { createEvent, type NewEvent } from "@/features/events";
import { user } from "@/features/users";
import type { MailSender } from "@/lib/mail";
import { listEventsBetween } from "@/features/events";
import { announce, getAvailability, getSeasonRecord, listAvailableUserIds, listMyReplies, listWaitingOnReply, nudge, saveReply } from "./index";
import { availabilityReply } from "./schema";

const now = new Date("2026-10-01T12:00:00Z");
const tom = { id: "tom", committee: true };
const sam = { id: "sam", committee: false };

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "committee" },
    { id: "sam", name: "Sam Patel", email: "sam@x.org", accessState: "approved" },
    { id: "ray", name: "Ray Old", email: "ray@x.org", accessState: "approved", playing: false },
    { id: "jo", name: "Jo King", email: "jo@x.org", accessState: "approved" },
    { id: "bex", name: "Bex Gone", email: "bex@x.org", accessState: "blocked" },
  ]);
  return db;
}

async function makeEvent(db: Awaited<ReturnType<typeof setup>>, overrides: Partial<NewEvent> & { start: Date }) {
  const base = { title: "Training", eventType: "training", venue: "Harlington", end: new Date(overrides.start.getTime() + 3_600_000) };
  const input = { ...base, ...overrides } as NewEvent;
  if (input.eventType === "match") {
    Object.assign(input, { matchDetails: { opponent: "Barts", homeAway: "home", competition: "bucs", meetTime: input.start } });
  }
  const made = await createEvent(db, input);
  if (!made.ok) throw new Error(made.error);
  return made.event.id;
}

describe("saveReply", () => {
  it("records a Player's own reply, and their next one replaces it", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });

    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "not_available", note: "", reason: "Exams" }, now);
    const later = new Date(now.getTime() + 60_000);
    expect(await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "late", reason: "" }, later)).toEqual({ ok: true });

    const availability = await getAvailability(db, eventId, sam, later);
    expect(availability.summary.available.map((r) => [r.name, r.note])).toEqual([["Sam Patel", "late"]]);
    expect(availability.summary.noReply.map((r) => r.name)).toEqual(["Jo King", "Tom Hale"]);
    expect(availability.myReply?.status).toBe("available");
  });

  it("refuses once the Event has started", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-01T11:00:00Z") });
    expect(await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now)).toEqual({
      ok: false,
      error: "Replies have closed for this one.",
    });
  });

  it("lets Committee reply for a Player, shown as set by them", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await saveReply(db, { eventId, playerId: "sam", viewer: tom, status: "not_available", note: "", reason: "Told me at the pub" }, now);
    const availability = await getAvailability(db, eventId, tom, now);
    expect(availability.summary.notAvailable[0]).toMatchObject({ name: "Sam Patel", reason: "Told me at the pub", setBy: "Tom Hale" });
  });

  it("doesn't let a Member reply for someone else", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const result = await saveReply(db, { eventId, playerId: "tom", viewer: sam, status: "available", note: "", reason: "" }, now);
    expect(result.ok).toBe(false);
  });
});

describe("getAvailability", () => {
  it("counts one reply for every Match that day", async () => {
    const db = await setup();
    const firsts = await makeEvent(db, { title: "1st XV v Barts", eventType: "match", start: new Date("2026-10-03T13:00:00Z") });
    const seconds = await makeEvent(db, { title: "2nd XV v UCL", eventType: "match", start: new Date("2026-10-03T15:00:00Z") });
    await saveReply(db, { eventId: firsts, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    const availability = await getAvailability(db, seconds, sam, now);
    expect(availability.summary.available.map((r) => r.name)).toEqual(["Sam Patel"]);
  });

  it("is read-only for a viewer with Playing off, who is left out of the lists", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const availability = await getAvailability(db, eventId, { id: "ray", committee: false }, now);
    expect(availability.canReplyForSelf).toBe(false);
    expect(availability.summary.noReply.map((r) => r.name)).toEqual(["Jo King", "Sam Patel", "Tom Hale"]);
  });

  it("doesn't take replies for a Social", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { title: "Curry", eventType: "social", start: new Date("2026-10-03T18:00:00Z") });
    expect((await getAvailability(db, eventId, sam, now)).takesReplies).toBe(false);
  });
});

function fakeMail() {
  const sent: Parameters<MailSender["send"]>[0][] = [];
  const mail: MailSender = { send: async (m) => void sent.push(m) };
  return { mail, sent };
}

const url = (id: string) => `https://app.test/events/${id}`;

describe("announce", () => {
  it("emails every Player with No reply, and shows who announced it and the Reply By", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    const { mail, sent } = fakeMail();
    const replyBy = new Date("2026-10-02T17:00:00Z");

    const result = await announce(db, { eventId, viewer: tom, replyBy, url: url(eventId), mail }, now);
    expect(result.ok && result.sent).toBe(2);
    expect(result.ok && result.reachedUserIds.sort()).toEqual(["jo", "tom"]);

    expect(sent.map((m) => m.to).sort()).toEqual(["jo@x.org", "tom@x.org"]);
    expect(sent[0].text).toContain(url(eventId));
    expect(sent[0].html).toContain(`<a href="${url(eventId)}"`);
    const availability = await getAvailability(db, eventId, tom, now);
    expect(availability.announcement).toEqual({ at: now, by: "Tom Hale", replyBy });
    expect(availability.canAnnounce).toBe(false);
  });

  it("only happens once, and once for every Match that day", async () => {
    const db = await setup();
    const firsts = await makeEvent(db, { title: "1st XV v Barts", eventType: "match", start: new Date("2026-10-03T13:00:00Z") });
    const seconds = await makeEvent(db, { title: "2nd XV v UCL", eventType: "match", start: new Date("2026-10-03T15:00:00Z") });
    const { mail, sent } = fakeMail();
    await announce(db, { eventId: firsts, viewer: tom, replyBy: null, url: url(firsts), mail }, now);

    expect(sent[0].subject).toBe("Can you make it? Sat 3 Oct — 1st XV v Barts & 2nd XV v UCL");
    expect(await announce(db, { eventId: seconds, viewer: tom, replyBy: null, url: url(seconds), mail }, now)).toEqual({
      ok: false,
      error: "This has already been announced.",
    });
    expect((await getAvailability(db, seconds, tom, now)).announcement?.by).toBe("Tom Hale");
  });

  it("is for Committee only", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const { mail, sent } = fakeMail();
    expect((await announce(db, { eventId, viewer: sam, replyBy: null, url: url(eventId), mail }, now)).ok).toBe(false);
    expect(sent).toEqual([]);
    expect((await getAvailability(db, eventId, sam, now)).canAnnounce).toBe(false);
  });

  it("marks replies after the Reply By as late", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const replyBy = new Date("2026-10-02T17:00:00Z");
    await announce(db, { eventId, viewer: tom, replyBy, url: url(eventId), mail: fakeMail().mail }, now);
    const after = new Date("2026-10-02T20:00:00Z");
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, after);
    expect((await getAvailability(db, eventId, tom, after)).summary.available[0]).toMatchObject({ name: "Sam Patel", late: true });
  });
});

describe("nudge", () => {
  it("emails everyone with No reply and records when they were nudged", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    const { mail, sent } = fakeMail();

    const result = await nudge(db, { eventId, viewer: tom, playerIds: null, url: url(eventId), mail }, now);
    expect(result.ok && result.sent).toBe(2);
    expect(result.ok && result.reachedUserIds.sort()).toEqual(["jo", "tom"]);

    expect(sent.map((m) => m.to).sort()).toEqual(["jo@x.org", "tom@x.org"]);
    expect(sent[0].subject).toMatch(/^Still need your answer/);
    const availability = await getAvailability(db, eventId, tom, now);
    expect(availability.summary.noReply.map((r) => [r.name, r.nudgedAt])).toEqual([
      ["Jo King", now],
      ["Tom Hale", now],
    ]);
  });

  it("emails only the ones chosen, skipping anyone who has since replied", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    const { mail, sent } = fakeMail();
    await nudge(db, { eventId, viewer: tom, playerIds: ["jo", "sam"], url: url(eventId), mail }, now);
    expect(sent.map((m) => m.to)).toEqual(["jo@x.org"]);
  });

  it("is for Committee only, and not once replies have closed", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-01T11:00:00Z") });
    const { mail, sent } = fakeMail();
    expect((await nudge(db, { eventId, viewer: sam, playerIds: null, url: url(eventId), mail }, now)).ok).toBe(false);
    expect((await nudge(db, { eventId, viewer: tom, playerIds: null, url: url(eventId), mail }, now)).ok).toBe(false);
    expect(sent).toEqual([]);
  });
});

describe("listWaitingOnReply", () => {
  it("lists announced Events the Player hasn't replied to, until they reply", async () => {
    const db = await setup();
    const asked = await makeEvent(db, { title: "Thursday training", start: new Date("2026-10-02T18:00:00Z") });
    await makeEvent(db, { title: "Not announced", start: new Date("2026-10-03T18:00:00Z") });
    const replyBy = new Date("2026-10-02T09:00:00Z");
    await announce(db, { eventId: asked, viewer: tom, replyBy, url: url(asked), mail: fakeMail().mail }, now);

    expect(await listWaitingOnReply(db, "sam", now)).toEqual([
      { eventId: asked, events: [{ title: "Thursday training", start: new Date("2026-10-02T18:00:00Z") }], replyBy },
    ]);

    await saveReply(db, { eventId: asked, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    expect(await listWaitingOnReply(db, "sam", now)).toEqual([]);
  });

  it("asks nothing of a Player with Playing off", async () => {
    const db = await setup();
    const asked = await makeEvent(db, { start: new Date("2026-10-02T18:00:00Z") });
    await announce(db, { eventId: asked, viewer: tom, replyBy: null, url: url(asked), mail: fakeMail().mail }, now);
    expect(await listWaitingOnReply(db, "ray", now)).toEqual([]);
  });
});

describe("listMyReplies", () => {
  it("gives the Player's own reply to each Training and Match, sharing one across a Match day", async () => {
    const db = await setup();
    const training = await makeEvent(db, { start: new Date("2026-10-02T18:00:00Z") });
    const firsts = await makeEvent(db, { title: "1st XV v Barts", eventType: "match", start: new Date("2026-10-03T13:00:00Z") });
    const seconds = await makeEvent(db, { title: "2nd XV v Barts", eventType: "match", start: new Date("2026-10-03T15:00:00Z") });
    const social = await makeEvent(db, { title: "Drinks", eventType: "social", start: new Date("2026-10-03T20:00:00Z") });
    await saveReply(db, { eventId: firsts, playerId: "sam", viewer: sam, status: "not_available", note: "", reason: "Exams" }, now);
    await saveReply(db, { eventId: training, playerId: "jo", viewer: { id: "jo", committee: false }, status: "available", note: "", reason: "" }, now);

    const events = await listEventsBetween(db, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-05T00:00:00Z"));
    const replies = await listMyReplies(db, "sam", events, now);
    expect(replies).toEqual({
      [training]: { status: null, open: true },
      [firsts]: { status: "not_available", open: true },
      [seconds]: { status: "not_available", open: true },
    });
    expect(replies[social]).toBeUndefined();
  });

  it("closes every reply for a Player with Playing off", async () => {
    const db = await setup();
    const training = await makeEvent(db, { start: new Date("2026-10-02T18:00:00Z") });
    const events = await listEventsBetween(db, new Date("2026-10-01T00:00:00Z"), new Date("2026-10-05T00:00:00Z"));
    expect(await listMyReplies(db, "ray", events, now)).toEqual({ [training]: { status: null, open: false } });
  });
});

describe("getSeasonRecord", () => {
  it("counts this season's Matches and Training by the Player's replies", async () => {
    const db = await setup();
    const early = new Date("2026-09-01T12:00:00Z");
    const training = await makeEvent(db, { start: new Date("2026-09-10T18:00:00Z") });
    await makeEvent(db, { start: new Date("2026-09-17T18:00:00Z") });
    const match = await makeEvent(db, { title: "1st XV v Barts", eventType: "match", start: new Date("2026-09-20T13:00:00Z") });
    await makeEvent(db, { title: "Last season", start: new Date("2026-08-20T18:00:00Z") });
    await announce(db, { eventId: training, viewer: tom, replyBy: null, url: url(training), mail: fakeMail().mail }, early);
    await saveReply(db, { eventId: training, playerId: "sam", viewer: sam, status: "not_available", note: "", reason: "Exams" }, early);
    await saveReply(db, { eventId: match, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, early);

    expect(await getSeasonRecord(db, "sam", now)).toEqual({
      matches: { all: { available: 1, notAvailable: 0, noReply: 0 }, announced: { available: 0, notAvailable: 0, noReply: 0 } },
      training: { all: { available: 0, notAvailable: 1, noReply: 1 }, announced: { available: 0, notAvailable: 1, noReply: 0 } },
    });
  });
});

describe("listAvailableUserIds", () => {
  it("groups Players who replied Available, per Event, leaving out Not available and No reply", async () => {
    const db = await setup();
    const trainingId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const matchId = await makeEvent(db, { eventType: "match", start: new Date("2026-10-04T14:00:00Z") });

    await saveReply(db, { eventId: trainingId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    await saveReply(db, { eventId: trainingId, playerId: "jo", viewer: tom, status: "not_available", note: "", reason: "Work" }, now);
    await saveReply(db, { eventId: matchId, playerId: "jo", viewer: tom, status: "available", note: "", reason: "" }, now);

    const byEvent = await listAvailableUserIds(db, [trainingId, matchId]);

    expect(byEvent.get(trainingId)).toEqual(new Set(["sam"]));
    expect(byEvent.get(matchId)).toEqual(new Set(["jo"]));
  });

  it("leaves out Blocked Users and Users with Playing off, even if a reply row exists", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    // ray has Playing off, bex is Blocked (see setup()) — inserted directly since
    // saveReply itself already refuses both.
    await db.insert(availabilityReply).values([
      { id: "r1", eventId, userId: "ray", status: "available", note: "", reason: "", setById: "ray", createdAt: now },
      { id: "r2", eventId, userId: "bex", status: "available", note: "", reason: "", setById: "bex", createdAt: now },
    ]);

    const byEvent = await listAvailableUserIds(db, [eventId]);

    expect(byEvent.get(eventId) ?? new Set()).toEqual(new Set());
  });
});
