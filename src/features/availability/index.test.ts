import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createEvent, listTeams, type NewEvent } from "@/features/events";
import { reportInjury } from "@/features/injuries";
import { addAway } from "@/features/players";
import { user } from "@/features/users";
import type { MailSender } from "@/lib/messaging/mail";
import { listEventsBetween } from "@/features/events";
import { announce, deleteAvailabilityForEvent, deliverAsk, dismissAsk, retryAsk, getAsk, getAvailability, getSeasonRecord, listAvailableUserIds, listMyReplies, listWaitingOnReply, markMessaged, nudge, saveReply } from "./index";
import { deleteEvent } from "@/features/events";
import { availabilityAnnouncement, availabilityAsk, availabilityMessaged, availabilityReply } from "./schema";

const now = new Date("2026-10-01T12:00:00Z");
const tom = { id: "tom", committee: true };
const sam = { id: "sam", committee: false };

async function setup() {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "committee" },
    { id: "sam", name: "Sam Patel", email: "sam@x.org", accessState: "approved" },
    { id: "ray", name: "Ray Old", email: "ray@x.org", accessState: "approved", playing: false },
    { id: "jo", name: "Jo King", email: "jo@x.org", accessState: "approved" },
    { id: "bex", name: "Bex Gone", email: "bex@x.org", accessState: "blocked" },
  ]);
  await listTeams(db);
  return db;
}

async function makeEvent(
  db: Awaited<ReturnType<typeof setup>>,
  overrides: { start: Date; title?: string; eventType?: "training" | "match" | "social" },
) {
  const { start, title, eventType = "training" } = overrides;
  const common = { start, end: new Date(start.getTime() + 3_600_000), venue: eventType === "training" ? (title ?? "Harlington") : "Harlington" };
  const input: NewEvent =
    eventType === "match"
      ? { ...common, eventType, matchDetails: { teamId: "1st XV", opponent: title ?? "Barts", homeAway: "home", competition: "bucs", meetTime: start } }
      : eventType === "social"
        ? { ...common, eventType, title: title ?? "Social" }
        : { ...common, eventType };
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

describe("deleteAvailabilityForEvent", () => {
  it("removes an Event's replies, leaving other Events' alone", async () => {
    const db = await setup();
    const gone = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const kept = await makeEvent(db, { start: new Date("2026-10-04T18:00:00Z") });
    for (const eventId of [gone, kept]) {
      await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    }

    await deleteAvailabilityForEvent(db, gone);

    expect(await db.select().from(availabilityReply)).toMatchObject([{ eventId: kept }]);
  });
});

describe("getAvailability", () => {
  it("counts one reply for every Match that day", async () => {
    const db = await setup();
    const firsts = await makeEvent(db, { title: "Barts", eventType: "match", start: new Date("2026-10-03T13:00:00Z") });
    const seconds = await makeEvent(db, { title: "UCL", eventType: "match", start: new Date("2026-10-03T15:00:00Z") });
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

async function announceAndDeliver(db: Awaited<ReturnType<typeof setup>>, input: Parameters<typeof announce>[1], mail: MailSender) {
  const result = await announce(db, input, now);
  if (!result.ok) throw new Error(result.error);
  return deliverAsk(db, result.askId, { url: url(input.eventId), mail }, now);
}

describe("deleting one Match of a double-header", () => {
  it("keeps the replies and the announcement that covered its sibling", async () => {
    const db = await setup();
    const firsts = await makeEvent(db, { start: new Date("2026-10-03T12:00:00Z"), eventType: "match", title: "Barts" });
    const seconds = await makeEvent(db, { start: new Date("2026-10-03T14:00:00Z"), eventType: "match", title: "Kings" });
    await saveReply(db, { eventId: firsts, playerId: "sam", viewer: sam, status: "not_available", note: "", reason: "Exams" }, now);
    await announce(db, { eventId: firsts, viewer: tom, replyBy: null }, now);

    await deleteAvailabilityForEvent(db, firsts);
    await deleteEvent(db, firsts);

    const availability = await getAvailability(db, seconds, tom, now);
    expect(availability.summary.notAvailable.map((r) => [r.name, r.reason])).toEqual([["Sam Patel", "Exams"]]);
    expect(availability.announcement).not.toBeNull();
  });

  it("still removes everything for a lone Match", async () => {
    const db = await setup();
    const lone = await makeEvent(db, { start: new Date("2026-10-03T12:00:00Z"), eventType: "match" });
    await saveReply(db, { eventId: lone, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);

    await deleteAvailabilityForEvent(db, lone);

    expect(await db.select().from(availabilityReply)).toEqual([]);
  });
});

describe("announce", () => {
  it("sends once when two Committee press Announce at the same time", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });

    const results = await Promise.all([
      announce(db, { eventId, viewer: tom, replyBy: null }, now),
      announce(db, { eventId, viewer: tom, replyBy: null }, now),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(availabilityAnnouncement)).toHaveLength(1);
    expect(await db.select().from(availabilityAsk)).toHaveLength(1);
  });

  it("emails every Player with No reply, and shows who announced it and the Reply By", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    const { mail, sent } = fakeMail();
    const replyBy = new Date("2026-10-02T17:00:00Z");

    const result = await announce(db, { eventId, viewer: tom, replyBy }, now);
    expect(result).toEqual({ ok: true, askId: expect.any(String), sending: 2 });
    expect(sent).toEqual([]);
    expect((await getAvailability(db, eventId, tom, now)).canAnnounce).toBe(false);

    const delivered = await deliverAsk(db, result.ok ? result.askId : "", { url: url(eventId), mail }, now);
    expect(delivered.reachedUserIds.sort()).toEqual(["jo", "tom"]);
    expect(sent.map((m) => m.to).sort()).toEqual(["jo@x.org", "tom@x.org"]);
    expect(sent[0].text).toContain(url(eventId));
    expect(sent[0].html).toContain(`<a href="${url(eventId)}"`);
    const availability = await getAvailability(db, eventId, tom, now);
    expect(availability.announcement).toEqual({ at: now, by: "Tom Hale", replyBy });
    expect(availability.canAnnounce).toBe(false);
  });

  it("only happens once, and once for every Match that day", async () => {
    const db = await setup();
    const firsts = await makeEvent(db, { title: "Barts", eventType: "match", start: new Date("2026-10-03T13:00:00Z") });
    const seconds = await makeEvent(db, { title: "UCL", eventType: "match", start: new Date("2026-10-03T15:00:00Z") });
    const { mail, sent } = fakeMail();
    await announceAndDeliver(db, { eventId: firsts, viewer: tom, replyBy: null }, mail);

    expect(sent[0].subject).toBe("Can you make it? Sat 3 Oct — 1st XV vs Barts & 1st XV vs UCL");
    expect(await announce(db, { eventId: seconds, viewer: tom, replyBy: null }, now)).toEqual({
      ok: false,
      error: "This has already been announced.",
    });
    expect((await getAvailability(db, seconds, tom, now)).announcement?.by).toBe("Tom Hale");
  });

  it("is for Committee only", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    expect((await announce(db, { eventId, viewer: sam, replyBy: null }, now)).ok).toBe(false);
    expect((await getAvailability(db, eventId, sam, now)).canAnnounce).toBe(false);
  });

  it("marks replies after the Reply By as late", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const replyBy = new Date("2026-10-02T17:00:00Z");
    await announce(db, { eventId, viewer: tom, replyBy }, now);
    const after = new Date("2026-10-02T20:00:00Z");
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, after);
    expect((await getAvailability(db, eventId, tom, after)).summary.available[0]).toMatchObject({ name: "Sam Patel", late: true });
  });
});

describe("Asks (how an Announce or Nudge's emails went)", () => {
  it("shows Committee the Ask while it's sending, and drops it once everyone's been reached", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const result = await announce(db, { eventId, viewer: tom, replyBy: null }, now);
    const askId = result.ok ? result.askId : "";

    expect((await getAvailability(db, eventId, tom, now)).asks).toEqual([
      { id: askId, kind: "announce", by: "Tom Hale", status: "sending", total: 3, sent: 0, missed: [] },
    ]);
    expect((await getAvailability(db, eventId, sam, now)).asks).toEqual([]);

    await deliverAsk(db, askId, { url: url(eventId), mail: fakeMail().mail }, now);
    expect(await getAsk(db, askId, tom, now)).toMatchObject({ status: "sent", total: 3, sent: 3, missed: [] });
    expect((await getAvailability(db, eventId, tom, now)).asks).toEqual([]);
  });

  it("keeps a failed Ask on the card, naming who wasn't reached, until Committee dismiss it", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const mail: MailSender = {
      send: async (m) => {
        if (m.to === "jo@x.org") throw new Error("SMTP down");
      },
    };
    const result = await nudge(db, { eventId, viewer: tom, playerIds: null }, now);
    const askId = result.ok ? result.askId : "";
    const delivered = await deliverAsk(db, askId, { url: url(eventId), mail }, now);
    expect(delivered.reachedUserIds.sort()).toEqual(["sam", "tom"]);

    const failed = { id: askId, kind: "nudge", by: "Tom Hale", status: "failed", total: 3, sent: 2, missed: ["Jo King"] };
    expect(await getAsk(db, askId, tom, now)).toEqual(failed);
    expect((await getAvailability(db, eventId, tom, now)).asks).toEqual([failed]);
    expect((await getAvailability(db, eventId, sam, now)).summary.noReply.find((r) => r.userId === "jo")?.nudgedAt).toBeNull();

    expect(await dismissAsk(db, askId, sam)).toEqual({ ok: false, error: "Only committee can do that." });
    expect(await dismissAsk(db, askId, tom)).toEqual({ ok: true });
    expect((await getAvailability(db, eventId, tom, now)).asks).toEqual([]);
  });

  it("retries a failed Ask for just the people it missed, and nudges only those it newly reaches", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    let down = true;
    const sentTo: string[] = [];
    const mail: MailSender = {
      send: async (m) => {
        if (down && m.to === "jo@x.org") throw new Error("SMTP down");
        sentTo.push(m.to);
      },
    };
    const result = await nudge(db, { eventId, viewer: tom, playerIds: null }, now);
    const askId = result.ok ? result.askId : "";
    await deliverAsk(db, askId, { url: url(eventId), mail }, now);

    expect(await retryAsk(db, askId, sam, now)).toEqual({ ok: false, error: "Only committee can do that." });
    down = false;
    sentTo.length = 0;
    expect(await retryAsk(db, askId, tom, now)).toEqual({ ok: true, askId, sending: 1 });
    expect(await getAsk(db, askId, tom, now)).toMatchObject({ status: "sending", total: 3, sent: 2, missed: [] });

    const delivered = await deliverAsk(db, askId, { url: url(eventId), mail }, now);
    expect(sentTo).toEqual(["jo@x.org"]);
    expect(delivered.reachedUserIds).toEqual(["jo"]);
    expect(await getAsk(db, askId, tom, now)).toMatchObject({ status: "sent", total: 3, sent: 3, missed: [] });
    expect((await getAvailability(db, eventId, sam, now)).summary.noReply.find((r) => r.userId === "jo")?.nudgedAt).not.toBeNull();
  });

  it("only retries an Ask that failed", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const result = await nudge(db, { eventId, viewer: tom, playerIds: null }, now);
    const askId = result.ok ? result.askId : "";
    expect(await retryAsk(db, askId, tom, now)).toEqual({ ok: false, error: "That one isn't waiting to be retried." });
    await deliverAsk(db, askId, { url: url(eventId), mail: fakeMail().mail }, now);
    expect(await retryAsk(db, askId, tom, now)).toEqual({ ok: false, error: "That one isn't waiting to be retried." });
  });

  it("only lets Committee look up an Ask", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    const result = await announce(db, { eventId, viewer: tom, replyBy: null }, now);
    expect(await getAsk(db, result.ok ? result.askId : "", sam, now)).toBeNull();
    expect(await getAsk(db, "nope", tom, now)).toBeNull();
  });
});

describe("nudge", () => {
  it("emails everyone with No reply and records when they were nudged", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    const { mail, sent } = fakeMail();

    const result = await nudge(db, { eventId, viewer: tom, playerIds: null }, now);
    expect(result).toEqual({ ok: true, askId: expect.any(String), sending: 2 });
    expect(sent).toEqual([]);

    const delivered = await deliverAsk(db, result.ok ? result.askId : "", { url: url(eventId), mail }, now);
    expect(delivered.reachedUserIds.sort()).toEqual(["jo", "tom"]);

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
    const result = await nudge(db, { eventId, viewer: tom, playerIds: ["jo", "sam"] }, now);
    await deliverAsk(db, result.ok ? result.askId : "", { url: url(eventId), mail }, now);
    expect(sent.map((m) => m.to)).toEqual(["jo@x.org"]);
  });

  it("is for Committee only, and not once replies have closed", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-01T11:00:00Z") });
    expect((await nudge(db, { eventId, viewer: sam, playerIds: null }, now)).ok).toBe(false);
    expect((await nudge(db, { eventId, viewer: tom, playerIds: null }, now)).ok).toBe(false);
  });
});

describe("listWaitingOnReply", () => {
  it("lists announced Events the Player hasn't replied to, until they reply", async () => {
    const db = await setup();
    const asked = await makeEvent(db, { title: "Thursday training", start: new Date("2026-10-02T18:00:00Z") });
    await makeEvent(db, { title: "Not announced", start: new Date("2026-10-03T18:00:00Z") });
    const replyBy = new Date("2026-10-02T09:00:00Z");
    await announce(db, { eventId: asked, viewer: tom, replyBy }, now);

    expect(await listWaitingOnReply(db, "sam", now)).toEqual([
      { eventId: asked, events: [{ title: "Training @ Thursday training", start: new Date("2026-10-02T18:00:00Z") }], replyBy },
    ]);

    await saveReply(db, { eventId: asked, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    expect(await listWaitingOnReply(db, "sam", now)).toEqual([]);
  });

  it("asks nothing of a Player with Playing off", async () => {
    const db = await setup();
    const asked = await makeEvent(db, { start: new Date("2026-10-02T18:00:00Z") });
    await announce(db, { eventId: asked, viewer: tom, replyBy: null }, now);
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
    await announce(db, { eventId: training, viewer: tom, replyBy: null }, early);
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

describe("markMessaged", () => {
  it("records who messaged a Player with No reply, shown to Committee beside the nudge", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });

    expect(await markMessaged(db, { eventId, playerId: "jo", viewer: tom }, now)).toEqual({ ok: true });

    const row = (await getAvailability(db, eventId, tom, now)).summary.noReply.find((r) => r.userId === "jo");
    expect(row?.messaged).toEqual({ at: now, by: "Tom Hale" });
    const other = (await getAvailability(db, eventId, tom, now)).summary.noReply.find((r) => r.userId === "tom");
    expect(other?.messaged).toBeNull();
  });

  it("keeps the record after the Player replies", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await markMessaged(db, { eventId, playerId: "jo", viewer: tom }, now);
    await saveReply(db, { eventId, playerId: "jo", viewer: { id: "jo", committee: false }, status: "available", note: "", reason: "" }, now);

    const row = (await getAvailability(db, eventId, tom, now)).summary.available.find((r) => r.userId === "jo");
    expect(row?.messaged).toEqual({ at: now, by: "Tom Hale" });
  });

  it("is for Committee only, and hidden from everyone else", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });

    expect(await markMessaged(db, { eventId, playerId: "jo", viewer: sam }, now)).toEqual({ ok: false, error: "Only committee can do that." });
    await markMessaged(db, { eventId, playerId: "jo", viewer: tom }, now);
    const row = (await getAvailability(db, eventId, sam, now)).summary.noReply.find((r) => r.userId === "jo");
    expect(row?.messaged).toBeNull();
  });

  it("is refused once the Event has started", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-01T10:00:00Z") });
    expect(await markMessaged(db, { eventId, playerId: "jo", viewer: tom }, now)).toEqual({ ok: false, error: "You can't message anyone for this one." });
  });

  it("is removed with the Event", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await markMessaged(db, { eventId, playerId: "jo", viewer: tom }, now);
    await deleteAvailabilityForEvent(db, eventId);
    expect(await db.select().from(availabilityMessaged)).toEqual([]);
  });
});

describe("Not chased (Away)", () => {
  const eventStart = new Date("2026-10-03T18:00:00Z");

  async function withSamAway() {
    const db = await setup();
    const eventId = await makeEvent(db, { start: eventStart });
    await addAway(db, { id: "sam", role: "member" }, "sam", { from: "2026-10-02", until: "2026-10-10", reason: "Exams" }, "2026-10-01");
    return { db, eventId };
  }

  it("moves an Away Player from No reply into an Away / Injured group, with the Reason for Committee", async () => {
    const { db, eventId } = await withSamAway();
    const availability = await getAvailability(db, eventId, tom, now);
    expect(availability.summary.noReply.map((r) => r.name)).toEqual(["Jo King", "Tom Hale"]);
    expect(availability.summary.notChased).toEqual([{ userId: "sam", name: "Sam Patel", kind: "away", detail: "Exams" }]);
  });

  it("only counts Away on the Event's own date", async () => {
    const { db } = await withSamAway();
    const later = await makeEvent(db, { start: new Date("2026-10-17T18:00:00Z") });
    const availability = await getAvailability(db, later, tom, now);
    expect(availability.summary.notChased).toEqual([]);
    expect(availability.summary.noReply.map((r) => r.name)).toContain("Sam Patel");
  });

  it("shows other Members nothing of it", async () => {
    const { db, eventId } = await withSamAway();
    const availability = await getAvailability(db, eventId, { id: "jo", committee: false }, now);
    expect(availability.summary.notChased).toEqual([]);
    expect(availability.summary.noReply.map((r) => r.name)).toEqual(["Jo King", "Tom Hale"]);
  });

  it("lets a reply win", async () => {
    const { db, eventId } = await withSamAway();
    await saveReply(db, { eventId, playerId: "sam", viewer: sam, status: "available", note: "", reason: "" }, now);
    const availability = await getAvailability(db, eventId, tom, now);
    expect(availability.summary.available.map((r) => r.name)).toEqual(["Sam Patel"]);
    expect(availability.summary.notChased).toEqual([]);
  });

  it("skips them in Announce and Nudge", async () => {
    const { db, eventId } = await withSamAway();
    const announced = await announce(db, { eventId, viewer: tom, replyBy: null }, now);
    expect(announced).toEqual({ ok: true, askId: expect.any(String), sending: 2 });
    const nudged = await nudge(db, { eventId, viewer: tom, playerIds: null }, now);
    expect(nudged).toEqual({ ok: true, askId: expect.any(String), sending: 2 });
  });

  it("still lets Committee pick them by hand in a Nudge", async () => {
    const { db, eventId } = await withSamAway();
    expect(await nudge(db, { eventId, viewer: tom, playerIds: ["sam"] }, now)).toEqual({ ok: true, askId: expect.any(String), sending: 1 });
  });

  it("doesn't ask them on Home", async () => {
    const { db, eventId } = await withSamAway();
    await announce(db, { eventId, viewer: tom, replyBy: null }, now);
    expect(await listWaitingOnReply(db, "sam", now)).toEqual([]);
    expect(await listWaitingOnReply(db, "jo", now)).toHaveLength(1);
  });
});

describe("Not chased (Fitness)", () => {
  const injure = async (db: Awaited<ReturnType<typeof setup>>, userId: string, status: "out" | "training_only" | "playing_through") => {
    const result = await reportInjury(
      db,
      { id: userId, role: "member" },
      userId,
      { area: "Knee", description: "", happenedOn: "2026-09-28", eventId: null, status, expectedReturn: null, notSure: true, needsPhysio: false, physioNote: "" },
      "2026-10-01",
      now,
    );
    if (!result.ok) throw new Error(result.error);
  };

  it("doesn't chase Out for Training or Matches, naming the Injury for Committee", async () => {
    const db = await setup();
    await injure(db, "jo", "out");
    for (const eventType of ["training", "match"] as const) {
      const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z"), eventType });
      const { summary } = await getAvailability(db, eventId, tom, now);
      expect(summary.noReply.map((r) => r.name)).not.toContain("Jo King");
      expect(summary.notChased).toEqual([{ userId: "jo", name: "Jo King", kind: "out", detail: "Knee" }]);
    }
  });

  it("chases Training only for Training but not for Matches", async () => {
    const db = await setup();
    await injure(db, "jo", "training_only");
    const training = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    expect((await getAvailability(db, training, tom, now)).summary.noReply.map((r) => r.name)).toContain("Jo King");
    const match = await makeEvent(db, { start: new Date("2026-10-04T14:00:00Z"), eventType: "match" });
    const { summary } = await getAvailability(db, match, tom, now);
    expect(summary.notChased).toEqual([{ userId: "jo", name: "Jo King", kind: "training_only", detail: "Knee" }]);
  });

  it("chases Playing through it as normal", async () => {
    const db = await setup();
    await injure(db, "jo", "playing_through");
    const match = await makeEvent(db, { start: new Date("2026-10-04T14:00:00Z"), eventType: "match" });
    const { summary } = await getAvailability(db, match, tom, now);
    expect(summary.noReply.map((r) => r.name)).toContain("Jo King");
    expect(summary.notChased).toEqual([]);
  });

  it("lets a reply win, and skips them on Home", async () => {
    const db = await setup();
    await injure(db, "jo", "out");
    const eventId = await makeEvent(db, { start: new Date("2026-10-03T18:00:00Z") });
    await announce(db, { eventId, viewer: tom, replyBy: null }, now);
    expect(await listWaitingOnReply(db, "jo", now)).toEqual([]);
    await saveReply(db, { eventId, playerId: "jo", viewer: { id: "jo", committee: false }, status: "available", note: "", reason: "" }, now);
    const { summary } = await getAvailability(db, eventId, tom, now);
    expect(summary.available.map((r) => r.name)).toEqual(["Jo King"]);
    expect(summary.notChased).toEqual([]);
  });

  describe("on the Event's date", () => {
    const injureUntil = async (db: Awaited<ReturnType<typeof setup>>, expectedReturn: string | null, happenedOn = "2026-09-28", reportedOn = "2026-10-01") => {
      const result = await reportInjury(
        db,
        { id: "jo", role: "member" },
        "jo",
        { area: "Knee", description: "", happenedOn, eventId: null, status: "out", expectedReturn, notSure: expectedReturn === null, needsPhysio: false, physioNote: "" },
        reportedOn,
        now,
      );
      if (!result.ok) throw new Error(result.error);
    };
    const chasedFor = async (db: Awaited<ReturnType<typeof setup>>, start: string) => {
      const eventId = await makeEvent(db, { start: new Date(start) });
      const { summary } = await getAvailability(db, eventId, tom, now);
      return { chased: summary.noReply.some((r) => r.name === "Jo King"), skipped: summary.notChased.length === 1 };
    };

    it("chases a Player again for an Event after their Expected Return, but not before it", async () => {
      const db = await setup();
      await injureUntil(db, "2026-10-10");
      expect(await chasedFor(db, "2026-10-08T18:00:00Z")).toEqual({ chased: false, skipped: true });
      expect(await chasedFor(db, "2026-10-10T18:00:00Z")).toEqual({ chased: true, skipped: false });
      expect(await chasedFor(db, "2026-10-14T18:00:00Z")).toEqual({ chased: true, skipped: false });
    });

    it("doesn't count an Injury against an Event dated before it happened", async () => {
      const db = await setup();
      await injureUntil(db, null, "2026-09-28");
      expect(await chasedFor(db, "2026-09-25T18:00:00Z")).toEqual({ chased: true, skipped: false });
      expect(await chasedFor(db, "2026-10-05T18:00:00Z")).toEqual({ chased: false, skipped: true });
    });

    it("keeps skipping them when the Expected Return has already passed but the Injury is still open", async () => {
      const db = await setup();
      await injureUntil(db, "2026-09-30", "2026-09-20", "2026-09-25");
      expect(await chasedFor(db, "2026-10-05T18:00:00Z")).toEqual({ chased: false, skipped: true });
    });

    it("applies to Home's Can you make it? card too", async () => {
      const db = await setup();
      await injureUntil(db, "2026-10-10");
      const soon = await makeEvent(db, { start: new Date("2026-10-08T18:00:00Z") });
      const later = await makeEvent(db, { start: new Date("2026-10-14T18:00:00Z") });
      await announce(db, { eventId: soon, viewer: tom, replyBy: null }, now);
      await announce(db, { eventId: later, viewer: tom, replyBy: null }, now);
      expect((await listWaitingOnReply(db, "jo", now)).map((w) => w.eventId)).toEqual([later]);
    });
  });
});
