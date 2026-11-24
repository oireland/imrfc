import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { failOnInsert } from "@/test/fail-on-insert";
import { event, matchDetails } from "./schema";
import {
  cancelEvent,
  createEvent,
  createEvents,
  deleteEvent,
  editEvent,
  getEvent,
  getEvents,
  listVenues,
  listEvents,
  listEventsBetween,
  listEventTitles,
  listMatchDay,
  listNextEvents,
  listPastEvents,
  listTeams,
  type NewEvent,
} from "./index";

/** Counts insert/update/delete calls made on a test db from now on. */
function countWrites(db: object): () => number {
  let count = 0;
  for (const method of ["insert", "update", "delete"] as const) {
    const target = db as Record<string, (...args: unknown[]) => unknown>;
    const original = target[method].bind(db);
    target[method] = (...args: unknown[]) => {
      count++;
      return original(...args);
    };
  }
  return () => count;
}

describe("listEvents cancelled option", () => {
  it("leaves out Cancelled Events when asked, and includes them otherwise", async () => {
    const db = await createTestDb();
    const base = { eventType: "training" as const, start: new Date("2999-01-07T19:00:00Z"), end: new Date("2999-01-07T20:00:00Z") };
    const kept = await createEvent(db, { ...base, venue: "Kept" });
    const gone = await createEvent(db, { ...base, venue: "Gone" });
    if (!kept.ok || !gone.ok) throw new Error("setup");
    await cancelEvent(db, gone.event.id);

    const live = await listEvents(db, { when: "upcoming", cancelled: false });
    const all = await listEvents(db, { when: "upcoming" });

    expect(live.map((e) => e.id)).toEqual([kept.event.id]);
    expect(all.map((e) => e.id).sort()).toEqual([kept.event.id, gone.event.id].sort());
  });
});

describe("listTeams", () => {
  it("seeds and returns 1st XV and 2nd XV", async () => {
    const db = await createTestDb();

    const teams = await listTeams(db);

    expect(teams.map((t) => t.name)).toEqual(["1st XV", "2nd XV"]);
  });

  it("is safe to call repeatedly", async () => {
    const db = await createTestDb();

    await listTeams(db);
    const teams = await listTeams(db);

    expect(teams).toHaveLength(2);
  });

  it("writes nothing once the Teams exist, so viewing a page is read-only", async () => {
    const db = await createTestDb();
    await listTeams(db);

    const writes = countWrites(db);
    await listTeams(db);

    expect(writes()).toBe(0);
  });
});

describe("createEvent", () => {
  it("saves a Match and its details together or not at all", async () => {
    const db = await createTestDb();
    await listTeams(db);
    const match: NewEvent = {
      eventType: "match",
      start: new Date("2999-01-07T14:00:00Z"),
      end: new Date("2999-01-07T16:00:00Z"),
      venue: "Harlington",
      matchDetails: { teamId: "1st XV", opponent: "Barts", homeAway: "home", competition: "bucs" },
    };

    await expect(createEvent(failOnInsert(db, matchDetails), match)).rejects.toThrow("boom");

    expect(await db.select().from(event)).toEqual([]);
  });

  it("creates a Training Event", async () => {
    const db = await createTestDb();
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
      team: { name: "1st XV" },
    });
  });

  it("keeps a Match's times that are still TBC as unset", async () => {
    const db = await createTestDb();
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
    const made = await createEvent(db, {
      eventType: "training",
      start: new Date("2999-01-07T19:00:00Z"),
      end: new Date("2999-01-07T20:30:00Z"),
      venue: "Harlington",
    });
    if (!made.ok) throw new Error(made.error);

    expect((await getEvent(db, made.event.id))?.team).toBeNull();
  });
});

describe("editEvent", () => {
  it("won't change an Event's type", async () => {
    const db = await createTestDb();
    const created = await createEvent(db, {
      eventType: "training",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venue: "Harlington",
    });
    if (!created.ok) throw new Error("expected Event to be created");

    const result = await editEvent(db, created.event.id, {
      eventType: "social",
      title: "Sneaky",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venue: "Harlington",
    });

    expect(result).toEqual({ ok: false, error: "An event's type can't be changed." });
    expect((await getEvent(db, created.event.id))!.title).toBe("Training @ Harlington");
  });

  it("edits a standalone Social's title, time, venue and notes", async () => {
    const db = await createTestDb();
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

    expect(await getEvent(db, created.event.id)).toMatchObject({ title: "2nd XV vs Sussex", team: { name: "2nd XV" } });
  });

  it("edits a Match's Match details, including a TBC time becoming known", async () => {
    const db = await createTestDb();
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

describe("listMatchDay", () => {
  it("returns every Match on the London day, soonest first, across a clocks-back day", async () => {
    const db = await createTestDb();
    const [firstXV] = await listTeams(db);
    const make = async (eventType: "match" | "social", start: string) => {
      const base = { start: new Date(start), end: new Date(new Date(start).getTime() + 5_400_000), venue: "Harlington" };
      const result = await createEvent(
        db,
        eventType === "match"
          ? { ...base, eventType, matchDetails: { teamId: firstXV.id, opponent: start, homeAway: "home", competition: "friendly" } }
          : { ...base, eventType, title: "Social" },
      );
      if (!result.ok) throw new Error(result.error);
      return result.event;
    };
    // The clocks go back on 2026-10-25, so that London day runs 00:00 BST to 24:00 GMT (25 hours).
    await make("match", "2026-10-24T22:30:00Z"); // 23:30 BST on the 24th
    const late = await make("match", "2026-10-25T23:30:00Z"); // 23:30 GMT on the 25th
    const early = await make("match", "2026-10-25T09:00:00Z");
    await make("social", "2026-10-25T12:00:00Z");
    await make("match", "2026-10-26T00:30:00Z"); // 00:30 on the 26th

    const day = await listMatchDay(db, early);

    expect(day.map((e) => e.id)).toEqual([early.id, late.id]);
  });
});

describe("listMatchDay at clock changes", () => {
  it.each([
    ["2025-10-26", "2025-10-26T23:30:00Z", "2025-10-27T00:30:00Z", "2025-10-26T12:00:00Z"], // clocks go back: 25h day
    ["2025-03-30", "2025-03-30T22:30:00Z", "2025-03-30T23:30:00Z", "2025-03-30T12:00:00Z"], // clocks go forward: 23h day
  ])("includes a 23:30 Match and excludes next-day 00:30 and non-Matches on %s", async (_day, lateStart, nextDayStart, socialStart) => {
    const db = await createTestDb();
    const [firstXV] = await listTeams(db);
    const make = async (eventType: "match" | "social", start: string) => {
      const base = { start: new Date(start), end: new Date(new Date(start).getTime() + 5_400_000), venue: "Harlington" };
      const result = await createEvent(
        db,
        eventType === "match"
          ? { ...base, eventType, matchDetails: { teamId: firstXV.id, opponent: start, homeAway: "home", competition: "friendly" } }
          : { ...base, eventType, title: "Social" },
      );
      if (!result.ok) throw new Error(result.error);
      return result.event;
    };
    const late = await make("match", lateStart);
    await make("match", nextDayStart);
    await make("social", socialStart);

    expect((await listMatchDay(db, late)).map((e) => e.id)).toEqual([late.id]);
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
    await listTeams(db);

    const result = await createEvents(db, [training("One"), match("1st XV")]);

    expect(result).toEqual({ ok: true, count: 2 });
    const events = await listEvents(db, { when: "upcoming" });
    expect(events.map((e) => e.title).sort()).toEqual(["1st XV vs UCL", "Training @ One"]);
  });

  it("creates none of them if any one fails", async () => {
    const db = await createTestDb();
    await listTeams(db);

    const result = await createEvents(db, [training("One"), match("3rd XV")]);

    expect(result.ok).toBe(false);
    expect(await listEvents(db, { when: "upcoming" })).toEqual([]);
  });

  it("saves a mixed batch with each Match's Team title and details", async () => {
    const db = await createTestDb();
    await listTeams(db);

    const result = await createEvents(db, [match("1st XV"), training("One"), match("2nd XV")]);

    expect(result).toEqual({ ok: true, count: 3 });
    const events = await listEvents(db, { when: "upcoming" });
    expect(events.map((e) => e.title).sort()).toEqual(["1st XV vs UCL", "2nd XV vs UCL", "Training @ One"]);
    const details = await db.select().from(matchDetails);
    expect(details.map((d) => d.teamId).sort()).toEqual(["1st XV", "2nd XV"]);
  });

  it("rejects the whole batch for an unknown Team in the middle", async () => {
    const db = await createTestDb();
    await listTeams(db);

    const result = await createEvents(db, [match("1st XV"), match("3rd XV"), training("One")]);

    expect(result).toEqual({ ok: false, error: "That team doesn't exist." });
    expect(await listEvents(db, { when: "upcoming" })).toEqual([]);
  });

  it("accepts an empty batch", async () => {
    const db = await createTestDb();
    expect(await createEvents(db, [])).toEqual({ ok: true, count: 0 });
  });
});

describe("listVenues", () => {
  it("suggests each venue already used once, most recently used first", async () => {
    const db = await createTestDb();
    const at = (venue: string, day: number): NewEvent => ({
      eventType: "training",
      start: new Date(Date.UTC(2999, 0, day, 19)),
      end: new Date(Date.UTC(2999, 0, day, 21)),
      venue,
    });
    for (const e of [at("Harlington", 1), at("Hyde Park", 2), at("  Harlington ", 3), at("  ", 4)]) await createEvent(db, e);

    expect(await listVenues(db)).toEqual(["Harlington", "Hyde Park"]);
  });
});

describe("listEventTitles", () => {
  it("names each of several Events in one go, leaving out ids that don't exist", async () => {
    const db = await createTestDb();
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

describe("getEvents", () => {
  it("loads each Event with its match details and Team in one go, leaving out ids that don't exist", async () => {
    const db = await createTestDb();
    await listTeams(db);
    const match = await createEvent(db, {
      eventType: "match",
      start: new Date("2999-01-07T14:00:00Z"),
      end: new Date("2999-01-07T16:00:00Z"),
      venue: "Harlington",
      matchDetails: { teamId: "2nd XV", opponent: "Barts", homeAway: "home", competition: "bucs" },
    });
    const training = await createEvent(db, {
      eventType: "training",
      start: new Date("2999-01-08T19:00:00Z"),
      end: new Date("2999-01-08T20:00:00Z"),
      venue: "Harlington",
    });
    if (!match.ok || !training.ok) throw new Error("expected Events to be created");

    const events = await getEvents(db, [match.event.id, training.event.id, "gone"]);

    expect(events.map((e) => e.id).sort()).toEqual([match.event.id, training.event.id].sort());
    const loaded = events.find((e) => e.id === match.event.id)!;
    expect(loaded.matchDetails?.opponent).toBe("Barts");
    expect(loaded.team?.name).toBe("2nd XV");
    expect(events.find((e) => e.id === training.event.id)).toMatchObject({ matchDetails: null, team: null });
    expect(await getEvents(db, [])).toEqual([]);
  });
});

describe("listPastEvents", () => {
  async function seed(n: number) {
    const db = await createTestDb();
    for (let i = 1; i <= n; i++) {
      await createEvent(db, {
        title: `Past ${i}`,
        eventType: "social",
        start: new Date(Date.UTC(2020, 0, i, 19)),
        end: new Date(Date.UTC(2020, 0, i, 21)),
        venue: "Harlington",
      });
    }
    return db;
  }

  it("pages newest first and says whether there are older ones", async () => {
    const db = await seed(5);
    const first = await listPastEvents(db, { page: 1, pageSize: 2 });
    expect(first.events.map((e) => e.title)).toEqual(["Past 5", "Past 4"]);
    expect(first.hasOlder).toBe(true);
    const last = await listPastEvents(db, { page: 3, pageSize: 2 });
    expect(last.events.map((e) => e.title)).toEqual(["Past 1"]);
    expect(last.hasOlder).toBe(false);
  });

  it("returns nothing past the end", async () => {
    const db = await seed(3);
    expect(await listPastEvents(db, { page: 9, pageSize: 2 })).toEqual({ events: [], hasOlder: false, page: 9 });
  });

  it("treats a bad page as page 1", async () => {
    const db = await seed(3);
    for (const page of [Number.NaN, 0, -2, 1.5]) {
      const r = await listPastEvents(db, { page, pageSize: 2 });
      expect(r.events.map((e) => e.title)).toEqual(["Past 3", "Past 2"]);
      expect(r.page).toBe(1);
    }
  });
});
