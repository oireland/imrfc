import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { cancelEvent, getEvent, listTeams } from "./index";
import {
  createSeries,
  editOccurrence,
  extendSeries,
  listOccurrences,
  type NewSeries,
} from "./series";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  const pattern: NewSeries = {
    title: "Wednesday Training",
    weekdays: [3],
    startTime: "19:00",
    endTime: "20:30",
    venue: "Harlington",
    startDate: "2999-01-09", // a Wednesday
    endDate: "2999-01-30",
  };
  return { db, pattern };
}

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe("createSeries", () => {
  it("creates every Occurrence immediately as a Training Event", async () => {
    const { db, pattern } = await setup();

    const result = await createSeries(db, pattern);

    if (!result.ok) throw new Error(result.error);
    const occurrences = await listOccurrences(db, result.series.id);
    expect(occurrences.map((o) => o.start.toISOString())).toEqual([
      "2999-01-09T19:00:00.000Z",
      "2999-01-16T19:00:00.000Z",
      "2999-01-23T19:00:00.000Z",
      "2999-01-30T19:00:00.000Z",
    ]);
    expect(occurrences[0]).toMatchObject({
      eventType: "training",
      title: "Wednesday Training",
      venue: "Harlington",
      end: new Date("2999-01-09T20:30:00Z"),
    });
  });

  it("keeps the clock time steady across the BST change", async () => {
    const { db, pattern } = await setup();

    const result = await createSeries(db, {
      ...pattern,
      startDate: "2999-03-27",
      endDate: "2999-04-10",
    });

    if (!result.ok) throw new Error(result.error);
    const occurrences = await listOccurrences(db, result.series.id);
    expect(occurrences.map((o) => o.start.toISOString())).toEqual([
      "2999-03-27T19:00:00.000Z",
      "2999-04-03T18:00:00.000Z",
      "2999-04-10T18:00:00.000Z",
    ]);
  });

  it("gives each Occurrence the Series' Teams", async () => {
    const { db, pattern } = await setup();
    const [firstXV] = await listTeams(db);

    const result = await createSeries(db, { ...pattern, teamIds: [firstXV.id] });

    if (!result.ok) throw new Error(result.error);
    const [first] = await listOccurrences(db, result.series.id);
    expect((await getEvent(db, first.id))?.teams.map((t) => t.name)).toEqual(["1st XV"]);
  });

  it("rejects an invalid Series and creates nothing", async () => {
    const { db, pattern } = await setup();

    const result = await createSeries(db, { ...pattern, weekdays: [] });

    expect(result.ok).toBe(false);
  });
});

describe("editOccurrence", () => {
  it("'this one' changes only that Occurrence", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);
    const [, second] = await listOccurrences(db, created.series.id);

    await editOccurrence(db, second.id, { venue: "Hyde Park", title: "Special" }, "this");

    const after = await listOccurrences(db, created.series.id);
    expect(titles(after)).toEqual([
      "Wednesday Training",
      "Special",
      "Wednesday Training",
      "Wednesday Training",
    ]);
    expect(after.map((o) => o.venue)).toEqual(["Harlington", "Hyde Park", "Harlington", "Harlington"]);
  });

  it("'this and future' leaves earlier Occurrences alone", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, { ...pattern, startDate: "2020-01-01", endDate: "2020-01-22" });
    if (!created.ok) throw new Error(created.error);
    const all = await listOccurrences(db, created.series.id);

    await editOccurrence(db, all[2].id, { startTime: "18:30" }, "future");

    const after = await listOccurrences(db, created.series.id);
    expect(after.map((o) => o.start.toISOString())).toEqual([
      "2020-01-01T19:00:00.000Z",
      "2020-01-08T19:00:00.000Z",
      "2020-01-15T18:30:00.000Z",
      "2020-01-22T18:30:00.000Z",
    ]);
  });

  it("'this and future' preserves Occurrences already edited individually", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);
    const [first, second, third] = await listOccurrences(db, created.series.id);
    await editOccurrence(db, third.id, { venue: "Hyde Park" }, "this");

    await editOccurrence(db, second.id, { title: "Renamed" }, "future");

    const after = await listOccurrences(db, created.series.id);
    expect(titles(after)).toEqual([first.title, "Renamed", "Wednesday Training", "Renamed"]);
    expect(after[2].venue).toBe("Hyde Park");
  });

  it("'this and future' also updates the Series so later extensions use the new pattern", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);
    const [first] = await listOccurrences(db, created.series.id);

    await editOccurrence(db, first.id, { title: "Renamed" }, "future");
    await extendSeries(db, created.series.id, "2999-02-06");

    const after = await listOccurrences(db, created.series.id);
    expect(titles(after).at(-1)).toBe("Renamed");
  });

  it("rejects an edit that would end before it starts", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);
    const [first] = await listOccurrences(db, created.series.id);

    const result = await editOccurrence(db, first.id, { startTime: "21:00" }, "this");

    expect(result.ok).toBe(false);
  });
});

describe("extendSeries", () => {
  it("creates only the extra Occurrences", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);

    const result = await extendSeries(db, created.series.id, "2999-02-13");

    expect(result.ok).toBe(true);
    const after = await listOccurrences(db, created.series.id);
    expect(after.map((o) => o.start.toISOString().slice(0, 10))).toEqual([
      "2999-01-09",
      "2999-01-16",
      "2999-01-23",
      "2999-01-30",
      "2999-02-06",
      "2999-02-13",
    ]);
  });

  it("rejects an end date that isn't later than the current one", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);

    const result = await extendSeries(db, created.series.id, "2999-01-30");

    expect(result.ok).toBe(false);
  });
});

describe("cancelling an Occurrence", () => {
  it("cancels only that Occurrence", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);
    const [, second] = await listOccurrences(db, created.series.id);

    await cancelEvent(db, second.id);

    const after = await listOccurrences(db, created.series.id);
    expect(after.map((o) => o.cancelled)).toEqual([false, true, false, false]);
  });
});
