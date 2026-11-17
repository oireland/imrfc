import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { cancelEvent } from "./index";
import { failOnInsert } from "@/test/fail-on-insert";
import { event } from "./schema";
import {
  createSeries,
  editOccurrence,
  extendSeries,
  listOccurrences,
  listSeries,
  type NewSeries,
} from "./series";

async function setup() {
  const db = await createTestDb();
  const pattern: NewSeries = {
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
      title: "Training @ Harlington",
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

  it("rejects an invalid Series and creates nothing", async () => {
    const { db, pattern } = await setup();

    const result = await createSeries(db, { ...pattern, weekdays: [] });

    expect(result.ok).toBe(false);
  });

  it("creates every Occurrence as a Social Event when the Series is Social", async () => {
    const { db, pattern } = await setup();

    const result = await createSeries(db, { ...pattern, eventType: "social", title: "Quiz night" });

    if (!result.ok) throw new Error(result.error);
    const occurrences = await listOccurrences(db, result.series.id);
    expect(occurrences.every((o) => o.eventType === "social" && o.title === "Quiz night")).toBe(true);
  });

  it("rejects a Social Series without a title", async () => {
    const { db, pattern } = await setup();

    const result = await createSeries(db, { ...pattern, eventType: "social", title: " " });

    expect(result).toEqual({ ok: false, error: "Give the series a title." });
  });
});

describe("Series limits", () => {
  it("refuses a Series with too many Occurrences and creates nothing", async () => {
    const { db, pattern } = await setup();

    const result = await createSeries(db, { ...pattern, weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: "2999-01-01", endDate: "2999-06-01" });

    expect(result.ok).toBe(false);
    expect(await listSeries(db)).toEqual([]);
  });

  it("refuses to extend a Series past the limit, leaving it as it was", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, { ...pattern, weekdays: [0, 1, 2, 3, 4, 5, 6] });
    if (!created.ok) throw new Error(created.error);

    const result = await extendSeries(db, created.series.id, "2999-04-30");

    expect(result.ok).toBe(false);
    expect(await listOccurrences(db, created.series.id)).toHaveLength(22);
    expect((await listSeries(db))[0].endDate).toBe("2999-01-30");
  });

  it("saves the Series and its Occurrences together or not at all", async () => {
    const { db, pattern } = await setup();
    const failing = failOnInsert(db, event);

    await expect(createSeries(failing, pattern)).rejects.toThrow("boom");

    expect(await listSeries(db)).toEqual([]);
  });
});

describe("editOccurrence", () => {
  it("'this one' changes only that Occurrence, and its title follows the venue", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);
    const [, second] = await listOccurrences(db, created.series.id);

    await editOccurrence(db, second.id, { venue: "Hyde Park" }, "this");

    const after = await listOccurrences(db, created.series.id);
    expect(titles(after)).toEqual([
      "Training @ Harlington",
      "Training @ Hyde Park",
      "Training @ Harlington",
      "Training @ Harlington",
    ]);
    expect(after.map((o) => o.venue)).toEqual(["Harlington", "Hyde Park", "Harlington", "Harlington"]);
  });

  it("retitles a Social Occurrence by hand", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, { ...pattern, eventType: "social", title: "Quiz" });
    if (!created.ok) throw new Error(created.error);
    const [first] = await listOccurrences(db, created.series.id);

    await editOccurrence(db, first.id, { title: "Special quiz" }, "this");

    expect(titles(await listOccurrences(db, created.series.id))).toEqual(["Special quiz", "Quiz", "Quiz", "Quiz"]);
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

    await editOccurrence(db, second.id, { venue: "The Union" }, "future");

    const after = await listOccurrences(db, created.series.id);
    expect(titles(after)).toEqual([first.title, "Training @ The Union", "Training @ Hyde Park", "Training @ The Union"]);
    expect(after[2].venue).toBe("Hyde Park");
  });

  it("'this and future' also updates the Series so later extensions use the new pattern", async () => {
    const { db, pattern } = await setup();
    const created = await createSeries(db, pattern);
    if (!created.ok) throw new Error(created.error);
    const [first] = await listOccurrences(db, created.series.id);

    await editOccurrence(db, first.id, { venue: "The Union" }, "future");
    await extendSeries(db, created.series.id, "2999-02-06");

    const after = await listOccurrences(db, created.series.id);
    expect(titles(after).at(-1)).toBe("Training @ The Union");
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

describe("Query efficiency", () => {
  /** Counts the db's `insert` calls from here on, so a fix can't reintroduce one insert per Occurrence. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function countInserts(db: any): () => number {
    const original = db.insert.bind(db);
    let count = 0;
    db.insert = (...args: unknown[]) => {
      count++;
      return original(...args);
    };
    return () => count;
  }

  it("creates a Series' Occurrences in a fixed number of inserts, however many Occurrences", async () => {
    const { db, pattern } = await setup();

    const fewInserts = countInserts(db);
    const short = await createSeries(db, { ...pattern, endDate: pattern.startDate });
    if (!short.ok) throw new Error(short.error);
    const insertsForOneOccurrence = fewInserts();

    const manyInserts = countInserts(db);
    const long = await createSeries(db, { ...pattern, endDate: "2999-03-27" });
    if (!long.ok) throw new Error(long.error);
    expect(await listOccurrences(db, long.series.id)).toHaveLength(12);
    expect(manyInserts()).toBe(insertsForOneOccurrence);
  });
});
