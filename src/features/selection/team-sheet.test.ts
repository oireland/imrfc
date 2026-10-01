import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { createEvent, listTeams, type NewEvent } from "@/features/events";
import { user } from "@/features/users";
import { pickGuest, pickPlayer, swapShirts } from "./index";
import { getTeamSheet, saveTeamSheet, setRoles } from "./team-sheet";

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

async function makeMatch(db: Awaited<ReturnType<typeof setup>>, start = "2026-10-03T13:30:00Z", teamId = "1st XV", meetTime = "2026-10-03T11:00:00Z") {
  const startDate = new Date(start);
  const made = await createEvent(db, {
    title: `${teamId} vs Barts`,
    eventType: "match",
    start: startDate,
    end: new Date(startDate.getTime() + 2 * 3_600_000),
    venue: "Harlington",
    teamIds: [teamId],
    matchDetails: { opponent: "Barts", homeAway: "home", competition: "bucs", meetTime: new Date(meetTime) },
  } as NewEvent);
  if (!made.ok) throw new Error(made.error);
  return made.event.id;
}

describe("getTeamSheet", () => {
  it("fills the header from the Event, in London time, for Committee only", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);

    const sheet = await getTeamSheet(db, eventId, tom, now);
    expect(sheet!.date).toBe("Sat 3 Oct");
    expect(sheet!.fields.title).toEqual({ value: "IMRFC 1st XV vs Barts", base: "IMRFC 1st XV vs Barts", overridden: false });
    expect(sheet!.fields.kickoff.value).toBe("2.30pm");
    expect(sheet!.fields.meet.value).toBe("12.00pm");
    expect(sheet!.fields.location.value).toBe("Harlington");

    expect(await getTeamSheet(db, eventId, sam, now)).toBeNull();
  });
});

describe("saveTeamSheet", () => {
  it("overrides a field for this Match only, and goes back to following the Event", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);

    await saveTeamSheet(db, { eventId, viewer: tom, fields: { kickoff: { value: "3.00pm", use: "override" } } }, now);
    expect((await getTeamSheet(db, eventId, tom, now))!.fields.kickoff).toEqual({ value: "3.00pm", base: "2.30pm", overridden: true });

    await saveTeamSheet(db, { eventId, viewer: tom, fields: { kickoff: { value: "ignored", use: "base" } } }, now);
    expect((await getTeamSheet(db, eventId, tom, now))!.fields.kickoff).toEqual({ value: "2.30pm", base: "2.30pm", overridden: false });
  });

  it("saves a Sheet Default per Team that other Matches for the Team pick up, but not other Teams", async () => {
    const db = await setup();
    const first = await makeMatch(db, "2026-10-03T13:30:00Z", "1st XV");
    const later = await makeMatch(db, "2026-10-10T13:30:00Z", "1st XV");
    const second = await makeMatch(db, "2026-10-03T13:30:00Z", "2nd XV");

    await saveTeamSheet(db, { eventId: first, viewer: tom, fields: { travelAttire: { value: "Club polo", use: "save" } } }, now);

    expect((await getTeamSheet(db, later, tom, now))!.fields.travelAttire).toEqual({ value: "Club polo", base: "Club polo", overridden: false });
    expect((await getTeamSheet(db, second, tom, now))!.fields.travelAttire.value).toBe("");
  });

  it("lets one Match override the default without changing it", async () => {
    const db = await setup();
    const first = await makeMatch(db, "2026-10-03T13:30:00Z");
    const later = await makeMatch(db, "2026-10-10T13:30:00Z");
    await saveTeamSheet(db, { eventId: first, viewer: tom, fields: { warmUpAttire: { value: "Bibs", use: "save" } } }, now);

    await saveTeamSheet(db, { eventId: later, viewer: tom, fields: { warmUpAttire: { value: "Tracksuit", use: "override" } } }, now);
    expect((await getTeamSheet(db, later, tom, now))!.fields.warmUpAttire).toEqual({ value: "Tracksuit", base: "Bibs", overridden: true });
    expect((await getTeamSheet(db, first, tom, now))!.fields.warmUpAttire.value).toBe("Bibs");
  });

  it("keeps the Schedule line", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    await saveTeamSheet(db, { eventId, viewer: tom, fields: { schedule: { value: "Changing rooms 1.15pm", use: "override" } } }, now);
    expect((await getTeamSheet(db, eventId, tom, now))!.fields.schedule.value).toBe("Changing rooms 1.15pm");
  });

  it("refuses anyone but Committee, and a Match that has started", async () => {
    const db = await setup();
    const eventId = await makeMatch(db);
    const edit = { fields: { kickoff: { value: "3pm", use: "override" as const } } };
    expect((await saveTeamSheet(db, { eventId, viewer: sam, ...edit }, now)).ok).toBe(false);
    expect((await saveTeamSheet(db, { eventId, viewer: tom, ...edit }, new Date("2026-10-03T14:00:00Z"))).ok).toBe(false);
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
