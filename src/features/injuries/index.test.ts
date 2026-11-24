import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { user, type Role } from "@/features/users";
import { clearInjuries, clearInjury, listFitness, listInjuries, listPhysioNeeds, logByMistake, reportInjury, updateInjury } from "./index";
import type { ReportInput } from "./rules";
import { injury, injuryChange } from "./schema";

const today = "2026-10-10";
const now = new Date("2026-10-10T12:00:00Z");
const hal = { id: "hal", role: "member" as const };
const fran = { id: "fran", role: "member" as const };
const tom = { id: "tom", role: "committee" as const };

async function setup() {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: "hal", name: "Hooker Hal", email: "hal@x.org", accessState: "approved" },
    { id: "fran", name: "Fly-half Fran", email: "fran@x.org", accessState: "approved" },
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "committee" },
    { id: "ann", name: "Ann Admin", email: "ann@x.org", accessState: "approved", role: "admin" },
  ]);
  return db;
}

const report = (overrides: Partial<ReportInput> = {}): ReportInput => ({
  area: "Thigh",
  description: "Pulled it sprinting",
  happenedOn: "2026-09-21",
  eventId: null,
  status: "training_only",
  expectedReturn: "2026-10-20",
  notSure: false,
  needsPhysio: true,
  physioNote: "Strapping",
  ...overrides,
});

async function reported(db: Awaited<ReturnType<typeof setup>>, overrides: Partial<ReportInput> = {}, actor: { id: string; role: Role } = hal, userId = "hal") {
  const result = await reportInjury(db, actor, userId, report(overrides), today, now);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("reportInjury", () => {
  it("records an open Injury with its first history line", async () => {
    const db = await setup();
    await reported(db);
    const { open } = await listInjuries(db, hal, "hal", today);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ area: "Thigh", status: "training_only", expectedReturn: "2026-10-20", needsPhysio: true, physioNote: "Strapping" });
    expect(open[0].history).toEqual([{ kind: "reported", from: null, to: "training_only", note: "", by: "Hooker Hal", at: now }]);
  });

  it("lets Committee report for anyone, but not a Member for someone else", async () => {
    const db = await setup();
    expect((await reportInjury(db, fran, "hal", report(), today, now)).ok).toBe(false);
    await reported(db, {}, tom, "hal");
    const { open } = await listInjuries(db, tom, "hal", today);
    expect(open[0].history[0].by).toBe("Tom Hale");
  });

  it("rejects what validation rejects", async () => {
    const db = await setup();
    expect(await reportInjury(db, hal, "hal", report({ expectedReturn: null }), today, now)).toEqual({
      ok: false,
      error: "Pick when you expect to be back, or say you're not sure yet.",
    });
  });

  it("alerts Committee, not whoever reported, with the name and state only", async () => {
    const db = await setup();
    const result = await reported(db, { status: "out" });
    expect(result.alert).toEqual({ userIds: ["ann", "tom"], title: "Hooker Hal is now Out", body: "", playerId: "hal" });
    const byTom = await reported(db, { status: "out" }, tom, "fran");
    expect(byTom.alert?.userIds).toEqual(["ann"]);
  });
});

describe("listInjuries privacy", () => {
  it("shows a Player's Injuries only to them and Committee", async () => {
    const db = await setup();
    await reported(db);
    expect((await listInjuries(db, fran, "hal", today)).open).toEqual([]);
    expect((await listInjuries(db, tom, "hal", today)).open).toHaveLength(1);
  });
});

describe("updateInjury", () => {
  it("moves between any statuses, recording who and when with the progress note", async () => {
    const db = await setup();
    const { id } = await reported(db, { status: "out", needsPhysio: false });
    const later = new Date("2026-10-11T09:00:00Z");
    const result = await updateInjury(
      db,
      hal,
      id,
      { status: "playing_through", expectedReturn: "2026-10-25", notSure: false, needsPhysio: true, physioNote: "Strapping", note: "Jogged 5k" },
      today,
      later,
    );
    expect(result).toMatchObject({ ok: true, alert: null });
    const [injury] = (await listInjuries(db, hal, "hal", today)).open;
    expect(injury).toMatchObject({ status: "playing_through", expectedReturn: "2026-10-25", needsPhysio: true });
    expect(injury.history.at(-1)).toEqual({ kind: "updated", from: "out", to: "playing_through", note: "Jogged 5k", by: "Hooker Hal", at: later });
  });

  it("can get worse again, alerting Committee", async () => {
    const db = await setup();
    const { id } = await reported(db, { status: "playing_through" });
    const result = await updateInjury(
      db,
      hal,
      id,
      { status: "out", expectedReturn: null, notSure: true, needsPhysio: false, physioNote: "", note: "" },
      today,
      now,
    );
    expect(result).toMatchObject({ ok: true, alert: { title: "Hooker Hal is now Out" } });
  });

  it("is for the Player or Committee only", async () => {
    const db = await setup();
    const { id } = await reported(db);
    const input = { status: "out" as const, expectedReturn: null, notSure: true, needsPhysio: false, physioNote: "", note: "" };
    expect((await updateInjury(db, fran, id, input, today, now)).ok).toBe(false);
    expect((await updateInjury(db, tom, id, input, today, now)).ok).toBe(true);
  });
});

describe("clearInjury", () => {
  it("moves it to history and out of Fitness", async () => {
    const db = await setup();
    const { id } = await reported(db, { status: "out", needsPhysio: false });
    expect(await clearInjury(db, hal, id, now)).toEqual({ ok: true });
    const listing = await listInjuries(db, hal, "hal", today);
    expect(listing.open).toEqual([]);
    expect(listing.history[0]).toMatchObject({ status: "cleared" });
    expect(listing.history[0].history.at(-1)).toMatchObject({ kind: "cleared", from: "out", to: "cleared", by: "Hooker Hal" });
    expect((await listFitness(db, today)).has("hal")).toBe(false);
  });

  it("can't be updated afterwards", async () => {
    const db = await setup();
    const { id } = await reported(db);
    await clearInjury(db, hal, id, now);
    const input = { status: "out" as const, expectedReturn: null, notSure: true, needsPhysio: false, physioNote: "", note: "" };
    expect((await updateInjury(db, hal, id, input, today, now)).ok).toBe(false);
  });
});

describe("logByMistake", () => {
  it("hides it everywhere but keeps the row, for whoever logged it", async () => {
    const db = await setup();
    const { id } = await reported(db);
    expect((await logByMistake(db, fran, id, now)).ok).toBe(false);
    expect(await logByMistake(db, hal, id, now)).toEqual({ ok: true });
    const listing = await listInjuries(db, tom, "hal", today);
    expect(listing.open).toEqual([]);
    expect(listing.history).toEqual([]);
    expect((await listFitness(db, today)).size).toBe(0);
  });

  it("lets Committee mark one a Player logged", async () => {
    const db = await setup();
    const { id } = await reported(db);
    expect(await logByMistake(db, tom, id, now)).toEqual({ ok: true });
  });

  it("won't let the Player mark one Committee logged", async () => {
    const db = await setup();
    const { id } = await reported(db, {}, tom, "hal");
    expect((await logByMistake(db, hal, id, now)).ok).toBe(false);
  });
});

describe("listInjuries ordering", () => {
  it("puts a passed Expected Return first, then Out, Training only, Playing through it", async () => {
    const db = await setup();
    await reported(db, { area: "Shoulder", status: "playing_through", needsPhysio: false });
    await reported(db, { area: "Knee", status: "out", needsPhysio: false });
    await reported(db, { area: "Ankle", status: "training_only" });
    // An Expected Return that has since passed: reported on 1 Oct, expecting 5 Oct.
    const old = await reportInjury(db, hal, "hal", report({ area: "Back", status: "playing_through", needsPhysio: false, expectedReturn: "2026-10-05" }), "2026-10-01", now);
    if (!old.ok) throw new Error(old.error);
    const { open } = await listInjuries(db, hal, "hal", today);
    expect(open.map((i) => i.area)).toEqual(["Back", "Knee", "Ankle", "Shoulder"]);
    expect(open[0].stillExpecting).toBe(true);
    expect(open[1].stillExpecting).toBe(false);
  });
});

describe("listFitness", () => {
  it("gives each Player with an open Injury their worst status, main Injury line and check-in flag", async () => {
    const db = await setup();
    await reported(db, { area: "Shoulder", status: "playing_through", needsPhysio: false, expectedReturn: null, notSure: true, happenedOn: "2026-09-01" });
    await reported(db, { area: "Ankle", status: "out", needsPhysio: false });
    const fitness = await listFitness(db, today);
    expect(fitness.get("hal")).toEqual({
      fitness: "out",
      line: "Out · ankle (+1)",
      detail: "Ankle",
      checkIn: "Playing through it 5 weeks, check in",
      changedAt: now,
    });
  });
});

describe("clearInjuries", () => {
  it("wipes a User's Injuries and their history", async () => {
    const db = await setup();
    await reported(db);
    await reported(db, {}, fran, "fran");
    await clearInjuries(db, "hal");
    expect((await listInjuries(db, tom, "hal", today)).open).toEqual([]);
    expect(await db.select({ userId: injury.userId }).from(injury)).toEqual([{ userId: "fran" }]);
    expect(await db.select({ id: injuryChange.id }).from(injuryChange)).toHaveLength(1);
  });
});

describe("listPhysioNeeds", () => {
  it("lists open Injuries that need physio, with where and what", async () => {
    const db = await setup();
    await reported(db);
    expect(await listPhysioNeeds(db)).toEqual([{ name: "Hooker Hal", area: "Thigh", physioNote: "Strapping" }]);
  });

  it("leaves out Injuries that don't need physio, are Out, Cleared, or logged by mistake", async () => {
    const db = await setup();
    await reported(db, { needsPhysio: false, physioNote: "" });
    await reported(db, { status: "out", needsPhysio: true }, fran, "fran");
    const cleared = await reported(db, { area: "Knee" }, fran, "fran");
    await clearInjury(db, fran, cleared.id, now);
    const slip = await reported(db, { area: "Head" }, fran, "fran");
    await logByMistake(db, fran, slip.id, now);
    expect(await listPhysioNeeds(db)).toEqual([]);
  });

  it("can be narrowed to some Players", async () => {
    const db = await setup();
    await reported(db);
    await reported(db, {}, fran, "fran");
    expect((await listPhysioNeeds(db, ["fran"])).map((i) => i.name)).toEqual(["Fly-half Fran"]);
    expect(await listPhysioNeeds(db, [])).toEqual([]);
  });
});
