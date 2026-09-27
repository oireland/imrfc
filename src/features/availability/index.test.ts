import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { createEvent, type NewEvent } from "@/features/events";
import { user } from "@/features/users";
import { getAvailability, saveReply } from "./index";

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
    expect(availability.summary.noReply.map((r) => r.name)).toEqual(["Tom Hale"]);
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
    expect(availability.summary.noReply.map((r) => r.name)).toEqual(["Sam Patel", "Tom Hale"]);
  });

  it("doesn't take replies for a Social", async () => {
    const db = await setup();
    const eventId = await makeEvent(db, { title: "Curry", eventType: "social", start: new Date("2026-10-03T18:00:00Z") });
    expect((await getAvailability(db, eventId, sam, now)).takesReplies).toBe(false);
  });
});
