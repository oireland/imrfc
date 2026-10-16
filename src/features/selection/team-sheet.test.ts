import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { createEvent, listTeams, type NewEvent } from "@/features/events";
import { user } from "@/features/users";
import { getBoard, pickGuest, pickPlayer, swapShirts } from "./index";
import { getNaming } from "./naming";
import { getTeamSheet, setRoles } from "./team-sheet";

const now = new Date("2026-10-01T12:00:00Z");
const tom = { id: "tom", committee: true };
const sam = { id: "sam", committee: false };

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "committee" },
    { id: "sam", name: "Sam Patel", email: "sam@x.org", accessState: "approved", preferredPosition: "Hooker" },
    { id: "jo", name: "Jo King", email: "jo@x.org", accessState: "approved", preferredPosition: "Lock" },
  ]);
  await listTeams(db);
  return db;
}

async function makeMatch(db: Awaited<ReturnType<typeof setup>>, start = "2026-10-03T13:30:00Z", teamId = "1st XV", meetTime = "2026-10-03T11:00:00Z", extra: Partial<Extract<NewEvent, { eventType: "match" }>["matchDetails"]> = {}) {
  const startDate = new Date(start);
  const made = await createEvent(db, {
    eventType: "match",
    start: startDate,
    end: new Date(startDate.getTime() + 2 * 3_600_000),
    venue: "Harlington",
    matchDetails: { teamId, opponent: "Barts", homeAway: "home", competition: "bucs", meetTime: new Date(meetTime), ...extra },
  } as NewEvent);
  if (!made.ok) throw new Error(made.error);
  return made.event.id;
}

describe("getTeamSheet", () => {
  it("fills the sheet from the Event, in London time, for Committee only", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);

    const sheet = await getTeamSheet(db, eventId, tom, now);
    expect(sheet!.date).toBe("Sat 3 Oct");
    expect(sheet!.layout.title).toBe("IMRFC 1st XV vs Barts");
    expect(sheet!.layout.details).toEqual([
      { label: "Kick-off", value: "2.30pm" },
      { label: "Meet", value: "12.00pm" },
      { label: "Location", value: "Harlington" },
    ]);

    expect(await getTeamSheet(db, eventId, sam, now)).toBeNull();
  });

  it("prints TBC for a kick-off and meet time that aren't known yet, and lists them as missing", async () => {
    const db = await setup();
    const made = await createEvent(db, {
      eventType: "match",
      start: new Date("2026-10-03T00:00:00Z"),
      end: new Date("2026-10-03T23:59:00Z"),
      startTbc: true,
      venue: "Brighton",
      matchDetails: { teamId: "1st XV", opponent: "Brighton", homeAway: "away", competition: "friendly" },
    });
    if (!made.ok) throw new Error(made.error);
    const eventId = made.event.id;

    const sheet = (await getTeamSheet(db, eventId, tom, now))!;

    expect(sheet.layout.details.slice(0, 2)).toEqual([
      { label: "Kick-off", value: "TBC" },
      { label: "Meet", value: "TBC" },
    ]);
    expect(sheet.missing).toEqual(
      expect.arrayContaining(["Kick-off time is TBC", "Meet time is TBC", "Transport meet time is TBC"]),
    );
  });

  it("only asks for a transport meet time on an away Match", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);

    expect((await getTeamSheet(db, eventId, tom, now))!.missing).not.toContain("Transport meet time is TBC");
  });

  it("carries the schedule, attire and post match text kept on the Match", async () => {
    const db = await setup();
    const eventId = await makeMatch(db, "2026-10-03T13:30:00Z", "1st XV", "2026-10-03T11:00:00Z", {
      schedule: "Changing rooms 1.15pm",
      travelAttire: "Club polo",
      warmUpAttire: " ",
      postMatchActivity: "Food in the bar",
    });

    const details = (await getTeamSheet(db, eventId, tom, now))!.layout.details;
    expect(details.map((d) => d.label)).toEqual(["Kick-off", "Meet", "Location", "Schedule", "Travel attire", "Post match"]);
    expect(details.find((d) => d.label === "Schedule")!.value).toBe("Changing rooms 1.15pm");
  });
});

describe("setRoles", () => {
  it("gives someone on the sheet Match Day Roles, Guests included", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    await pickPlayer(db, { eventId, shirt: 1, userId: "sam", viewer: tom }, now);
    await pickGuest(db, { eventId, shirt: 20, name: "Dev Ringer", viewer: tom }, now);

    expect((await setRoles(db, { eventId, shirt: 1, roles: ["KD", "C"], viewer: tom }, now)).ok).toBe(true);
    expect((await setRoles(db, { eventId, shirt: 20, roles: ["LM"], viewer: tom }, now)).ok).toBe(true);

    const sheet = (await getTeamSheet(db, eventId, tom, now))!;
    expect(sheet.layout.rows).toEqual([
      { shirt: 1, name: "Sam Patel", roles: "C, KD" },
      { shirt: 20, name: "Dev Ringer", roles: "LM" },
    ]);
  });

  it("moves C or VC when given to someone else, but lets LM and the rest go to many", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    await pickPlayer(db, { eventId, shirt: 1, userId: "sam", viewer: tom }, now);
    await pickPlayer(db, { eventId, shirt: 4, userId: "jo", viewer: tom }, now);

    await setRoles(db, { eventId, shirt: 1, roles: ["C", "LM"], viewer: tom }, now);
    await setRoles(db, { eventId, shirt: 4, roles: ["C", "LM"], viewer: tom }, now);

    const rows = (await getTeamSheet(db, eventId, tom, now))!.layout.rows;
    expect(rows.map((r) => r.roles)).toEqual(["LM", "C, LM"]);
  });

  it("can't give roles to an empty Shirt", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    expect((await setRoles(db, { eventId, shirt: 3, roles: ["C"], viewer: tom }, now)).ok).toBe(false);
  });

  it("follows the person when they swap Shirts, and goes when someone else takes the Shirt", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    await pickPlayer(db, { eventId, shirt: 1, userId: "sam", viewer: tom }, now);
    await setRoles(db, { eventId, shirt: 1, roles: ["C"], viewer: tom }, now);

    await swapShirts(db, { from: { eventId, shirt: 1 }, to: { eventId, shirt: 2 }, viewer: tom }, now);
    expect((await getTeamSheet(db, eventId, tom, now))!.layout.rows).toEqual([{ shirt: 2, name: "Sam Patel", roles: "C" }]);

    await pickPlayer(db, { eventId, shirt: 2, userId: "jo", viewer: tom }, now);
    expect((await getTeamSheet(db, eventId, tom, now))!.layout.rows).toEqual([{ shirt: 2, name: "Jo King", roles: "" }]);
  });
});

describe("what's missing", () => {
  it("lists what's wrong with the side", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    await pickPlayer(db, { eventId, shirt: 2, userId: "sam", viewer: tom }, now);

    const { missing } = (await getTeamSheet(db, eventId, tom, now))!;
    expect(missing).toContain("14 empty starting shirts (1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)");
    expect(missing).toContain("Sam Patel hasn't replied");
    expect(missing).toContain("No captain");
  });
});

describe("with a board already loaded", () => {
  it("draws the sheet and naming from the board it is given instead of loading its own", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    const board = (await getBoard(db, eventId, tom, now))!;
    const supplied = { ...board, pitches: board.pitches.map((p) => ({ ...p, label: "From the supplied board" })) };

    expect((await getTeamSheet(db, eventId, tom, now, supplied))!.label).toBe("From the supplied board");
    expect(await getNaming(db, eventId, tom, now, supplied)).toMatchObject({ canName: true });
    expect((await getTeamSheet(db, eventId, tom, now))!.label).toBe("1st XV");
  });
});
