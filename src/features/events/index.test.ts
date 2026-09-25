import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { location } from "@/features/locations";
import { cancelEvent, createEvent, getEvent, listEvents, listEventsBetween, listNextEvents, listTeams, type NewEvent } from "./index";

async function seedVenue(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [row] = await db
    .insert(location)
    .values({
      id: crypto.randomUUID(),
      name: "Harlington",
      address: "Sports ground",
      isVenue: true,
      isStore: false,
    })
    .returning();
  return row;
}

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
    const venue = await seedVenue(db);
    const input: NewEvent = {
      title: "Wednesday Training",
      eventType: "training",
      start: new Date("2999-01-07T19:00:00Z"),
      end: new Date("2999-01-07T20:30:00Z"),
      venueId: venue.id,
    };

    const result = await createEvent(db, input);

    expect(result.ok).toBe(true);
    const events = await listEvents(db, { when: "upcoming" });
    expect(events).toMatchObject([{ title: "Wednesday Training", eventType: "training" }]);
  });

  it("rejects an invalid Event and creates nothing", async () => {
    const db = await createTestDb();
    await migrate(db);
    const venue = await seedVenue(db);

    const result = await createEvent(db, {
      title: "",
      eventType: "social",
      start: new Date("2026-01-07T19:00:00Z"),
      end: new Date("2026-01-07T20:30:00Z"),
      venueId: venue.id,
    });

    expect(result.ok).toBe(false);
    expect(await listEvents(db, { when: "upcoming" })).toEqual([]);
  });

  it("creates a Match with type-specific details and Teams", async () => {
    const db = await createTestDb();
    await migrate(db);
    const venue = await seedVenue(db);
    const [firstXV] = await listTeams(db);

    const result = await createEvent(db, {
      title: "vs UCL",
      eventType: "match",
      start: new Date("2999-01-10T14:00:00Z"),
      end: new Date("2999-01-10T16:00:00Z"),
      venueId: venue.id,
      teamIds: [firstXV.id],
      matchDetails: {
        opponent: "UCL",
        homeAway: "home",
        competition: "bucs",
        meetTime: new Date("2999-01-10T13:00:00Z"),
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected Event to be created");
    const found = await getEvent(db, result.event.id);
    expect(found).toMatchObject({
      title: "vs UCL",
      matchDetails: { opponent: "UCL", homeAway: "home", competition: "bucs" },
      teams: [{ name: "1st XV" }],
    });
  });
});

describe("listEvents", () => {
  it("splits Events into Upcoming and Past", async () => {
    const db = await createTestDb();
    await migrate(db);
    const venue = await seedVenue(db);
    await createEvent(db, {
      title: "Past social",
      eventType: "social",
      start: new Date("2020-01-01T19:00:00Z"),
      end: new Date("2020-01-01T21:00:00Z"),
      venueId: venue.id,
    });
    await createEvent(db, {
      title: "Future social",
      eventType: "social",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venueId: venue.id,
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
    const venue = await seedVenue(db);
    const created = await createEvent(db, {
      title: "Social",
      eventType: "social",
      start: new Date("2999-01-01T19:00:00Z"),
      end: new Date("2999-01-01T21:00:00Z"),
      venueId: venue.id,
    });
    if (!created.ok) throw new Error("expected Event to be created");

    await cancelEvent(db, created.event.id);

    const found = await getEvent(db, created.event.id);
    expect(found?.cancelled).toBe(true);
  });
});

describe("listNextEvents", () => {
  it("returns the next few upcoming Events, skipping Cancelled ones", async () => {
    const db = await createTestDb();
    await migrate(db);
    const venue = await seedVenue(db);
    const ids: string[] = [];
    for (const day of [1, 2, 3, 4]) {
      const made = await createEvent(db, {
        title: `Day ${day}`,
        eventType: "social",
        start: new Date(`2999-01-0${day}T19:00:00Z`),
        end: new Date(`2999-01-0${day}T21:00:00Z`),
        venueId: venue.id,
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
    const venue = await seedVenue(db);
    const make = (title: string, start: string) =>
      createEvent(db, {
        title,
        eventType: "training",
        start: new Date(start),
        end: new Date(new Date(start).getTime() + 7_200_000),
        venueId: venue.id,
      });
    await make("Before", "2026-08-31T18:00:00Z");
    await make("Later", "2026-09-20T18:00:00Z");
    await make("Sooner", "2026-09-02T18:00:00Z");
    await make("After", "2026-10-01T18:00:00Z");

    const events = await listEventsBetween(db, new Date("2026-09-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"));

    expect(events.map((e) => e.title)).toEqual(["Sooner", "Later"]);
  });
});
