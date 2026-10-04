import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import {
  cancelEvent,
  createEvent,
  createEvents,
  deleteEvent,
  editEvent,
  getEvent,
  listVenues,
  listEvents,
  listEventsBetween,
  listEventTitles,
  listNextEvents,
  listTeams,
  type NewEvent,
} from "./index";

describe("listTeams", () => {
  it("seeds and returns 1st XV and 2nd XV", async () => {
    const db = await createTestDb();
    await migrate(db);

    const teams = await listTeams(db);

    expect(teams.map((t) => t.name)).toEqual(["1st XV", "2nd XV"]);
  });

  it("is safe to call repeatedly", async () => {
    const db = await createTestDb();
    await migrate(db);

    await listTeams(db);
    const teams = await listTeams(db);

    expect(teams).toHaveLength(2);
  });
});

describe("createEvent", () => {
  it("creates a Training Event", async () => {
    const db = await createTestDb();
    await migrate(db);
    const input: NewEvent = {
      eventType: "training",
      start: new Date("2999-01-07T19:00:00Z"),
      end: new Date("2999-01-07T20:30:00Z"),
      venue: "Harlington",
    };

    const result = await createEvent(db, input);

    expect(result.ok).toBe(true);
    const events = await listEvents(db, { when: "upcoming" });
    expect(events).toMatchObject([{ title: "Training @ Harlington", eventType: "training" }]);
  });

  it("rejects an invalid Event and creates nothing", async () => {
    const db = await createTestDb();
    await migrate(db);

    const result = await createEvent(db, {
      title: " ",
      eventType: "social",
      start: new Date("2026-01-07T19:00:00Z"),
      end: new Date("2026-01-07T20:30:00Z"),
      venue: "Harlington",
    });

    expect(result.ok).toBe(false);
    expect(await listEvents(db, { when: "upcoming" })).toEqual([]);
  });

  it("creates a Match with type-specific details, its Team and a derived title", async () => {
    const db = await createTestDb();
    await migrate(db);
    const [firstXV] = await listTeams(db);

    const result = await createEvent(db, {
      eventType: "match",
      start: new Date("2999-01-10T14:00:00Z"),
      end: new Date("2999-01-10T16:00:00Z"),
      venue: "Harlington",
      matchDetails: {
        teamId: firstXV.id,
        opponent: "St Georges",
        homeAway: "home",
        competition: "bucs",
        meetTime: new Date("2999-01-10T13:00:00Z"),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Event to be created");
    const found = await getEvent(db, result.event.id);
    expect(found).toMatchObject({
      title: "1st XV vs St Georges",
      startTbc: false,
      matchDetails: { opponent: "St Georges", homeAway: "home", competition: "bucs", teamId: firstXV.id },
      teams: [{ name: "1st XV" }],
    });
  });

  it("keeps a Match's times that are still TBC as unset", async () => {
    const db = await createTestDb();
    await migrate(db);
    const [firstXV] = await listTeams(db);

    const result = await createEvent(db, {
      eventType: "match",
      start: new Date("2999-01-10T00:00:00Z"),
      end: new Date("2999-01-10T23:59:00Z"),
      startTbc: true,
      venue: "Brighton",
      matchDetails: { teamId: firstXV.id, opponent: "Brighton", homeAway: "away", competition: "friendly" },
    });

    if (!result.ok) throw new Error(result.error);
    const found = await getEvent(db, result.event.id);
    expect(found).toMatchObject({ startTbc: true, matchDetails: { meetTime: null, travelMeetTime: null } });
  });

  it("rejects a Match for a Team that doesn't exist and creates nothing", async () => {
    const db = await createTestDb();
    await migrate(db);

    const result = await createEvent(db, {
      eventType: "match",
      start: new Date("2999-01-10T14:00:00Z"),
      end: new Date("2999-01-10T16:00:00Z"),
      venue: "Harlington",
      matchDetails: { teamId: "3rd XV", opponent: "UCL", homeAway: "home", competition: "bucs" },
    });

    expect(result).toEqual({ ok: false, error: "That team doesn't exist." });
    expect(await listEvents(db, { when: "upcoming" })).toEqual([]);
  });

  it("gives a Training and a Social no Teams", async () => {
    const db = await createTestDb();
    await migrate(db);
    const made = await createEvent(db, {
      eventType: "training",
      start: new Date("2999-01-07T19:00:00Z"),
      end: new Date("2999-01-07T20:30:00Z"),
      venue: "Harlington",
    });
    if (!made.ok) throw new Error(made.error);

    expect((await getEvent(db, made.event.id))?.teams).toEqual([]);
  });
});

describe("editEvent", () => {
  it("edits a standalone Social's title, time, venue and notes", async () => {
    const db = await createTestDb();
    await migrate(db);
    const created = await createEvent(db, {
      title: "Social",
      eventType: "social",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venue: "Harlington",
    });
    if (!created.ok) throw new Error("expected Event to be created");

    const result = await editEvent(db, created.event.id, {
      title: "Christmas Social",
      eventType: "social",
      start: new Date("2999-01-02T18:00:00Z"),
      end: new Date("2999-01-02T22:00:00Z"),
      venue: "The Union",
      notes: " Fancy dress ",
    });

    expect(result.ok).toBe(true);
    const found = await getEvent(db, created.event.id);
    expect(found).toMatchObject({
      title: "Christmas Social",
      start: new Date("2999-01-02T18:00:00Z"),
      end: new Date("2999-01-02T22:00:00Z"),
      venue: "The Union",
      notes: " Fancy dress ",
    });
  });

  it("re-derives a Training's title when its venue changes", async () => {
    const db = await createTestDb();
    await migrate(db);
    const training = (venue: string): NewEvent => ({
      eventType: "training",
      start: new Date("2999-01-07T19:00:00Z"),
      end: new Date("2999-01-07T20:30:00Z"),
      venue,
    });
    const created = await createEvent(db, training("Harlington"));
    if (!created.ok) throw new Error(created.error);

    await editEvent(db, created.event.id, training("Hyde Park"));

    expect((await getEvent(db, created.event.id))?.title).toBe("Training @ Hyde Park");
  });

  it("re-derives a Match's title and Team when they change", async () => {
    const db = await createTestDb();
    await migrate(db);
    const [firstXV, secondXV] = await listTeams(db);
    const match = (teamId: string, opponent: string): NewEvent => ({
      eventType: "match",
      start: new Date("2999-01-10T14:00:00Z"),
      end: new Date("2999-01-10T16:00:00Z"),
      venue: "Brighton",
      matchDetails: { teamId, opponent, homeAway: "away", competition: "friendly" },
    });
    const created = await createEvent(db, match(firstXV.id, "Brighton"));
    if (!created.ok) throw new Error(created.error);

    await editEvent(db, created.event.id, match(secondXV.id, "Sussex"));

    expect(await getEvent(db, created.event.id)).toMatchObject({ title: "2nd XV vs Sussex", teams: [{ name: "2nd XV" }] });
  });

  it("edits a Match's Match details, including a TBC time becoming known", async () => {
    const db = await createTestDb();
    await migrate(db);
    const [firstXV] = await listTeams(db);
    const created = await createEvent(db, {
      eventType: "match",
      start: new Date("2999-01-10T00:00:00Z"),
      end: new Date("2999-01-10T23:59:00Z"),
      startTbc: true,
      venue: "Brighton",
      matchDetails: { teamId: firstXV.id, opponent: "Brighton", homeAway: "away", competition: "friendly" },
    });
    if (!created.ok) throw new Error("expected Event to be created");

    const result = await editEvent(db, created.event.id, {
      eventType: "match",
      start: new Date("2999-01-10T14:00:00Z"),
      end: new Date("2999-01-10T16:00:00Z"),
      venue: "Brighton",
      matchDetails: {
        teamId: firstXV.id,
        opponent: "Brighton",
        homeAway: "away",
        competition: "bucs",
        meetTime: new Date("2999-01-10T12:00:00Z"),
        travelMeetTime: new Date("2999-01-10T11:00:00Z"),
        travelMeetPoint: "South Ken station",
      },
    });

    expect(result.ok).toBe(true);
    const found = await getEvent(db, created.event.id);
    expect(found?.startTbc).toBe(false);
    expect(found?.matchDetails).toMatchObject({
      competition: "bucs",
      meetTime: new Date("2999-01-10T12:00:00Z"),
      travelMeetTime: new Date("2999-01-10T11:00:00Z"),
      travelMeetPoint: "South Ken station",
    });
  });

  it("rejects an invalid edit and leaves the Event untouched", async () => {
    const db = await createTestDb();
    await migrate(db);
    const created = await createEvent(db, {
      title: "Social",
      eventType: "social",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venue: "Harlington",
    });
    if (!created.ok) throw new Error("expected Event to be created");

    const result = await editEvent(db, created.event.id, {
      title: "",
      eventType: "social",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venue: "Harlington",
    });

    expect(result.ok).toBe(false);
    const found = await getEvent(db, created.event.id);
    expect(found?.title).toBe("Social");
  });
});

describe("listEvents", () => {
  it("splits Events into Upcoming and Past", async () => {
    const db = await createTestDb();
    await migrate(db);
    await createEvent(db, {
      title: "Past social",
      eventType: "social",
      start: new Date("2020-01-01T19:00:00Z"),
      end: new Date("2020-01-01T21:00:00Z"),
      venue: "Harlington",
    });
    await createEvent(db, {
      title: "Future social",
      eventType: "social",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venue: "Harlington",
    });

    const upcoming = await listEvents(db, { when: "upcoming" });
    const past = await listEvents(db, { when: "past" });

    expect(upcoming.map((e) => e.title)).toEqual(["Future social"]);
    expect(past.map((e) => e.title)).toEqual(["Past social"]);
  });
});

describe("cancelEvent", () => {
  it("marks an Event Cancelled without deleting it", async () => {
    const db = await createTestDb();
    await migrate(db);
    const created = await createEvent(db, {
      title: "Social",
      eventType: "social",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venue: "Harlington",
    });
    if (!created.ok) throw new Error("expected Event to be created");

    await cancelEvent(db, created.event.id);

    const found = await getEvent(db, created.event.id);
    expect(found?.cancelled).toBe(true);
  });
});

describe("deleteEvent", () => {
  it("removes an Event and its Match details for good", async () => {
    const db = await createTestDb();
    await migrate(db);
    const [team] = await listTeams(db);
    const created = await createEvent(db, {
      eventType: "match",
      start: new Date("2999-01-01T14:00:00Z"),
      end: new Date("2999-01-01T16:00:00Z"),
      venue: "Harlington",
      matchDetails: { teamId: team.id, opponent: "Quins", homeAway: "home", competition: "bucs" },
    });
    if (!created.ok) throw new Error("expected Event to be created");

    await deleteEvent(db, created.event.id);

    expect(await getEvent(db, created.event.id)).toBeUndefined();
  });
});

describe("listNextEvents", () => {
  it("returns the next few upcoming Events, skipping Cancelled ones", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ids: string[] = [];
    for (const day of [1, 2, 3, 4]) {
      const made = await createEvent(db, {
        title: `Day ${day}`,
        eventType: "social",
        start: new Date(`2999-01-0${day}T19:00:00Z`),
        end: new Date(`2999-01-0${day}T21:00:00Z`),
        venue: "Harlington",
      });
      if (!made.ok) throw new Error(made.error);
      ids.push(made.event.id);
    }
    await cancelEvent(db, ids[0]);

    const next = await listNextEvents(db, 2);

    expect(next.map((e) => e.title)).toEqual(["Day 2", "Day 3"]);
  });
});

describe("listEventsBetween", () => {
  it("returns Events starting in the range, soonest first", async () => {
    const db = await createTestDb();
    await migrate(db);
    const make = (title: string, start: string) =>
      createEvent(db, {
        title,
        eventType: "social",
        start: new Date(start),
        end: new Date(new Date(start).getTime() + 7_200_000),
        venue: "Harlington",
      });
    await make("Before", "2026-08-31T18:00:00Z");
    await make("Later", "2026-09-20T18:00:00Z");
    await make("Sooner", "2026-09-02T18:00:00Z");
    await make("After", "2026-10-01T18:00:00Z");

    const events = await listEventsBetween(db, new Date("2026-09-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"));

    expect(events.map((e) => e.title)).toEqual(["Sooner", "Later"]);
  });
});

describe("createEvents", () => {
  const training = (venue: string): NewEvent => ({
    eventType: "training",
    start: new Date("2999-01-07T19:00:00Z"),
    end: new Date("2999-01-07T20:30:00Z"),
    venue,
  });
  const match = (teamId: string): NewEvent => ({
    eventType: "match",
    start: new Date("2999-01-10T14:00:00Z"),
    end: new Date("2999-01-10T16:00:00Z"),
    venue: "Harlington",
    matchDetails: { teamId, opponent: "UCL", homeAway: "home", competition: "bucs" },
  });

  it("creates every Event, with its derived title and Team", async () => {
    const db = await createTestDb();
    await migrate(db);
    await listTeams(db);

    const result = await createEvents(db, [training("One"), match("1st XV")]);

    expect(result).toEqual({ ok: true, count: 2 });
    const events = await listEvents(db, { when: "upcoming" });
    expect(events.map((e) => e.title).sort()).toEqual(["1st XV vs UCL", "Training @ One"]);
  });

  it("creates none of them if any one fails", async () => {
    const db = await createTestDb();
    await migrate(db);
    await listTeams(db);

    const result = await createEvents(db, [training("One"), match("3rd XV")]);

    expect(result.ok).toBe(false);
    expect(await listEvents(db, { when: "upcoming" })).toEqual([]);
  });
});

describe("listVenues", () => {
  it("suggests each venue already used once, most recently used first", async () => {
    const db = await createTestDb();
    await migrate(db);
    const at = (venue: string, day: number): NewEvent => ({
      eventType: "training",
      start: new Date(Date.UTC(2999, 0, day, 19)),
      end: new Date(Date.UTC(2999, 0, day, 21)),
      venue,
    });
    for (const e of [at("Harlington", 1), at("Hyde Park", 2), at("Harlington", 3), at("  ", 4)]) await createEvent(db, e);

    expect(await listVenues(db)).toEqual(["Harlington", "Hyde Park"]);
  });
});

describe("listEventTitles", () => {
  it("names each of several Events in one go, leaving out ids that don't exist", async () => {
    const db = await createTestDb();
    await migrate(db);
    const make = async (title: string) => {
      const made = await createEvent(db, {
        title,
        eventType: "social",
        start: new Date(Date.UTC(2999, 0, 1, 19)),
        end: new Date(Date.UTC(2999, 0, 1, 21)),
        venue: "Harlington",
      });
      if (!made.ok) throw new Error(made.error);
      return made.event;
    };
    const a = await make("Social A");
    const b = await make("Social B");

    const titles = await listEventTitles(db, [a.id, b.id, "gone"]);

    expect(titles).toEqual(new Map([[a.id, "Social A"], [b.id, "Social B"]]));
    expect(await listEventTitles(db, [])).toEqual(new Map());
  });
});
