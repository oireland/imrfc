import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { saveReply } from "@/features/availability";
import { createEvent, listTeams, type NewEvent } from "@/features/events";
import { user } from "@/features/users";
import { addShirt, clearShirt, deleteSelectionForEvent, getBoard, listPickedPlayerIds, pickGuest, pickPlayer, removeShirt, setRoles, swapShirts } from "./index";

const now = new Date("2026-10-01T12:00:00Z");
const tom = { id: "tom", committee: true };
const sam = { id: "sam", committee: false };

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "committee" },
    { id: "sam", name: "Sam Patel", email: "sam@x.org", accessState: "approved", preferredPosition: "Hooker" },
    { id: "jo", name: "Jo King", email: "jo@x.org", accessState: "approved", preferredPosition: "Lock", otherPositions: ["Number 8"] },
    { id: "ray", name: "Ray Old", email: "ray@x.org", accessState: "approved", playing: false },
  ]);
  await listTeams(db);
  return db;
}

async function makeMatch(db: Awaited<ReturnType<typeof setup>>, start: string, teamId = "1st XV", overrides: Partial<NewEvent> = {}) {
  const startDate = new Date(start);
  const made = await createEvent(db, {
    eventType: "match",
    start: startDate,
    end: new Date(startDate.getTime() + 2 * 3_600_000),
    venue: "Harlington",
    matchDetails: { teamId, opponent: "Barts", homeAway: "home", competition: "bucs", meetTime: startDate },
    ...overrides,
  } as NewEvent);
  if (!made.ok) throw new Error(made.error);
  return made.event.id;
}

const shirtOf = async (db: Awaited<ReturnType<typeof setup>>, eventId: string, shirt: number, pitch = 0) => {
  const board = await getBoard(db, eventId, tom, now);
  return board!.pitches[pitch].shirts.find((s) => s.shirt === shirt)!;
};

describe("getBoard", () => {
  it("has a pitch of 23 empty Shirts for a lone Match, Committee only", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");

    const board = await getBoard(db, eventId, tom, now);
    expect(board!.pitches).toHaveLength(1);
    expect(board!.pitches[0].label).toBe("1st XV");
    expect(board!.pitches[0].shirts).toHaveLength(23);
    expect(board!.pitches[0].shirts[3]).toMatchObject({ shirt: 4, position: "Lock", occupant: null });
    expect(board!.pitches[0].readOnly).toBe(false);

    expect(await getBoard(db, eventId, sam, now)).toBeNull();
  });

  it("puts every Match that day on one board, soonest first, and nothing for a Training", async () => {
    const db = await setup();
    const second = await makeMatch(db, "2026-10-03T13:00:00Z", "2nd XV");
    const first = await makeMatch(db, "2026-10-03T11:00:00Z", "1st XV");

    const board = await getBoard(db, second, tom, now);
    expect(board!.pitches.map((p) => [p.eventId, p.label])).toEqual([
      [first, "1st XV"],
      [second, "2nd XV"],
    ]);

    const training = await createEvent(db, {
      eventType: "training",
      start: new Date("2026-10-02T18:00:00Z"),
      end: new Date("2026-10-02T19:00:00Z"),
      venue: "Harlington",
    } as NewEvent);
    if (!training.ok) throw new Error(training.error);
    expect(await getBoard(db, training.event.id, tom, now)).toBeNull();
  });

  it("is read-only once the Match has started or is Cancelled", async () => {
    const db = await setup();
    const past = await makeMatch(db, "2026-10-01T10:00:00Z");
    expect((await getBoard(db, past, tom, now))!.pitches[0].readOnly).toBe(true);
  });

  it("offers every Playing Player in Position order, with their Availability", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await saveReply(db, { eventId, playerId: "jo", viewer: tom, status: "available", note: "", reason: "" }, now);
    await saveReply(db, { eventId, playerId: "sam", viewer: tom, status: "not_available", note: "", reason: "Exams" }, now);

    const { candidates } = (await getBoard(db, eventId, tom, now))!;
    expect(candidates.map((c) => [c.id, c.availability])).toEqual([
      ["sam", "not_available"],
      ["jo", "available"],
      ["tom", "no_reply"],
    ]);
  });
});

describe("pickPlayer", () => {
  it("puts a Player on a Shirt with their Fit and Availability, and says who did it", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await saveReply(db, { eventId, playerId: "jo", viewer: tom, status: "available", note: "", reason: "" }, now);

    expect(await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now)).toEqual({ ok: true });
    expect(await shirtOf(db, eventId, 4)).toMatchObject({
      occupant: { kind: "player", userId: "jo", name: "Jo King", fit: "preferred", availability: "available" },
      changedBy: "Tom Hale",
    });
  });

  it("flags someone out of position, and allows someone with no reply", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 10, userId: "sam", viewer: tom }, now);
    expect(await shirtOf(db, eventId, 10)).toMatchObject({ occupant: { fit: "rest", availability: "no_reply" } });
  });

  it("replaces whoever was on the Shirt", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);
    await pickPlayer(db, { eventId, shirt: 4, userId: "sam", viewer: tom }, now);
    expect((await shirtOf(db, eventId, 4)).occupant).toMatchObject({ userId: "sam" });
  });

  it("moves a Player already on another Shirt, leaving the old one empty", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);
    expect(await pickPlayer(db, { eventId, shirt: 5, userId: "jo", viewer: tom }, now)).toEqual({ ok: true, movedFrom: "1st XV 4" });
    expect((await shirtOf(db, eventId, 4)).occupant).toBeNull();
    expect((await shirtOf(db, eventId, 5)).occupant).toMatchObject({ userId: "jo" });
  });

  it("moves a Player from the other pitch that day", async () => {
    const db = await setup();
    const first = await makeMatch(db, "2026-10-03T11:00:00Z", "1st XV");
    const second = await makeMatch(db, "2026-10-03T13:00:00Z", "2nd XV");
    await pickPlayer(db, { eventId: second, shirt: 12, userId: "sam", viewer: tom }, now);

    expect(await pickPlayer(db, { eventId: first, shirt: 2, userId: "sam", viewer: tom }, now)).toEqual({ ok: true, movedFrom: "2nd XV 12" });
    expect((await shirtOf(db, first, 2)).occupant).toMatchObject({ userId: "sam" });
    expect((await shirtOf(db, first, 12, 1)).occupant).toBeNull();
  });

  it("is refused for anyone but Committee, past Matches, Cancelled ones, and Players who aren't Playing", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    expect(await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: sam }, now)).toEqual({ ok: false, error: "Only committee can pick the team." });

    const past = await makeMatch(db, "2026-10-01T10:00:00Z");
    expect(await pickPlayer(db, { eventId: past, shirt: 4, userId: "jo", viewer: tom }, now)).toEqual({ ok: false, error: "This match has already started." });

    expect(await pickPlayer(db, { eventId, shirt: 4, userId: "ray", viewer: tom }, now)).toEqual({ ok: false, error: "That player isn't playing." });
    expect(await pickPlayer(db, { eventId, shirt: 40, userId: "jo", viewer: tom }, now)).toEqual({ ok: false, error: "There's no shirt 40." });
  });
});

describe("Match Day Roles on the board", () => {
  it("shows a Shirt's roles, and a new pick starts with none", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);
    expect(await setRoles(db, { eventId, shirt: 4, roles: ["C", "KD"], viewer: tom }, now)).toEqual({ ok: true });
    expect(await shirtOf(db, eventId, 4)).toMatchObject({ roles: ["C", "KD"] });
    expect(await shirtOf(db, eventId, 5)).toMatchObject({ roles: [] });

    await pickPlayer(db, { eventId, shirt: 4, userId: "sam", viewer: tom }, now);
    expect(await shirtOf(db, eventId, 4)).toMatchObject({ roles: [] });
  });
});

describe("pickGuest", () => {
  it("puts a typed name on a Shirt, replacing a Player", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 9, userId: "sam", viewer: tom }, now);
    expect(await pickGuest(db, { eventId, shirt: 9, name: "  Dev Ringer ", viewer: tom }, now)).toEqual({ ok: true });
    expect((await shirtOf(db, eventId, 9)).occupant).toEqual({ kind: "guest", name: "Dev Ringer" });
  });

  it("needs a name", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    expect(await pickGuest(db, { eventId, shirt: 9, name: "  ", viewer: tom }, now)).toEqual({ ok: false, error: "Type the guest's name." });
  });
});

describe("clearShirt", () => {
  it("empties a Shirt", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);
    await clearShirt(db, { eventId, shirt: 4, viewer: tom }, now);
    expect((await shirtOf(db, eventId, 4)).occupant).toBeNull();
  });
});

describe("deleteSelectionForEvent", () => {
  it("removes an Event's picks, leaving other Events' alone", async () => {
    const db = await setup();
    const gone = await makeMatch(db, "2026-10-03T13:00:00Z");
    const kept = await makeMatch(db, "2026-10-10T13:00:00Z");
    for (const eventId of [gone, kept]) await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);

    await deleteSelectionForEvent(db, gone);

    expect((await shirtOf(db, gone, 4)).occupant).toBeNull();
    expect((await shirtOf(db, kept, 4)).occupant).toMatchObject({ userId: "jo" });
  });
});

describe("swapShirts", () => {
  it("swaps two filled Shirts, or moves into an empty one", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);
    await pickPlayer(db, { eventId, shirt: 2, userId: "sam", viewer: tom }, now);

    await swapShirts(db, { from: { eventId, shirt: 4 }, to: { eventId, shirt: 2 }, viewer: tom }, now);
    expect((await shirtOf(db, eventId, 4)).occupant).toMatchObject({ userId: "sam" });
    expect((await shirtOf(db, eventId, 2)).occupant).toMatchObject({ userId: "jo" });

    await swapShirts(db, { from: { eventId, shirt: 4 }, to: { eventId, shirt: 20 }, viewer: tom }, now);
    expect((await shirtOf(db, eventId, 4)).occupant).toBeNull();
    expect((await shirtOf(db, eventId, 20)).occupant).toMatchObject({ userId: "sam" });
  });

  it("swaps across pitches, Guests included", async () => {
    const db = await setup();
    const first = await makeMatch(db, "2026-10-03T11:00:00Z", "1st XV");
    const second = await makeMatch(db, "2026-10-03T13:00:00Z", "2nd XV");
    await pickPlayer(db, { eventId: first, shirt: 4, userId: "jo", viewer: tom }, now);
    await pickGuest(db, { eventId: second, shirt: 5, name: "Dev", viewer: tom }, now);

    await swapShirts(db, { from: { eventId: first, shirt: 4 }, to: { eventId: second, shirt: 5 }, viewer: tom }, now);
    expect((await shirtOf(db, first, 4)).occupant).toEqual({ kind: "guest", name: "Dev" });
    expect((await shirtOf(db, second, 5, 1)).occupant).toMatchObject({ userId: "jo" });
  });
});

describe("addShirt and removeShirt", () => {
  it("adds Shirts 24, 25… per Match, and removes an empty extra one", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    expect(await addShirt(db, { eventId, viewer: tom }, now)).toEqual({ ok: true });
    await addShirt(db, { eventId, viewer: tom }, now);
    expect((await getBoard(db, eventId, tom, now))!.pitches[0].shirts.map((s) => s.shirt).slice(-3)).toEqual([23, 24, 25]);

    await pickPlayer(db, { eventId, shirt: 25, userId: "jo", viewer: tom }, now);
    expect(await removeShirt(db, { eventId, viewer: tom }, now)).toEqual({ ok: false, error: "Empty shirt 25 first." });
    await clearShirt(db, { eventId, shirt: 25, viewer: tom }, now);
    expect(await removeShirt(db, { eventId, viewer: tom }, now)).toEqual({ ok: true });
    expect((await getBoard(db, eventId, tom, now))!.pitches[0].shirts).toHaveLength(24);
  });

  it("never goes below the 23 you start with", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    expect(await removeShirt(db, { eventId, viewer: tom }, now)).toEqual({ ok: false, error: "A team always has 23 shirts." });
  });
});

describe("listPickedPlayerIds", () => {
  it("lists the Players on a Match's Shirts, not Guests or empty Shirts", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:00:00Z");
    await pickPlayer(db, { eventId, shirt: 2, userId: "sam", viewer: tom }, now);
    await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);
    await pickGuest(db, { eventId, shirt: 9, name: "Visiting Vic", viewer: tom }, now);

    expect((await listPickedPlayerIds(db, eventId)).sort()).toEqual(["jo", "sam"]);
  });

  it("is empty before anyone is picked", async () => {
    const db = await setup();
    expect(await listPickedPlayerIds(db, await makeMatch(db, "2026-10-03T13:00:00Z"))).toEqual([]);
  });
});

describe("a Match with a TBC kick-off", () => {
  it("stays editable through match day and goes read-only after it", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-02T23:00:00Z", "1st XV", {
      end: new Date("2026-10-03T22:59:00Z"),
      startTbc: true,
    });
    const matchMorning = new Date("2026-10-03T08:00:00Z");
    expect((await getBoard(db, eventId, tom, matchMorning))!.pitches[0].readOnly).toBe(false);
    expect((await pickPlayer(db, { eventId, shirt: 2, userId: "sam", viewer: tom }, matchMorning)).ok).toBe(true);
    expect((await getBoard(db, eventId, tom, new Date("2026-10-03T23:30:00Z")))!.pitches[0].readOnly).toBe(true);
  });
});
