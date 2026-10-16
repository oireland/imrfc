import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { eraseUser, user } from "@/features/users";
import { clearAway, getPlayer, listPlayers, setPlaying, setPlayerPositions } from "./index";
import { addAway, awayAlert, editAway, imBack, listAway, listAwayOn, removeAway } from "./index";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values([
    { id: "hal", name: "Hooker Hal", email: "hal@x.org", accessState: "approved", preferredPosition: "Hooker" },
    { id: "fran", name: "Fly-half Fran", email: "fran@x.org", accessState: "approved", preferredPosition: "Fly-half" },
  ]);
  return db;
}

describe("listPlayers", () => {
  it("lists approved Users as Players, Position-ordered", async () => {
    const db = await setup();
    const listing = await listPlayers(db);
    expect(listing.playing.map((p) => p.name)).toEqual(["Hooker Hal", "Fly-half Fran"]);
    expect(listing.notPlaying).toEqual([]);
  });

  it("leaves out deleted accounts", async () => {
    const db = await setup();
    await eraseUser(db, "hal");
    const listing = await listPlayers(db);
    expect([...listing.playing, ...listing.notPlaying].map((p) => p.name)).toEqual(["Fly-half Fran"]);
    expect(await getPlayer(db, "hal")).toBeUndefined();
  });
});

describe("setPlaying", () => {
  it("moves a Player to Not playing", async () => {
    const db = await setup();
    await setPlaying(db, "hal", false);
    const listing = await listPlayers(db);
    expect(listing.playing.map((p) => p.name)).toEqual(["Fly-half Fran"]);
    expect(listing.notPlaying.map((p) => p.name)).toEqual(["Hooker Hal"]);
  });
});

describe("setPlayerPositions", () => {
  it("sets Preferred and Other Positions, deduplicated and never repeating the Preferred one", async () => {
    const db = await setup();
    await setPlayerPositions(db, "hal", "Lock", ["Lock", "Number 8", "Number 8"]);
    const player = await getPlayer(db, "hal");
    expect(player?.preferredPosition).toBe("Lock");
    expect(player?.otherPositions).toEqual(["Number 8"]);
  });
});

describe("setPlayerPositions validation", () => {
  it("rejects positions that aren't on the list and changes nothing", async () => {
    const db = await setup();
    const bad = await setPlayerPositions(db, "hal", "Lock", ["Goalkeeper" as never]);
    expect(bad.ok).toBe(false);
    const bad2 = await setPlayerPositions(db, "hal", "Striker" as never, []);
    expect(bad2.ok).toBe(false);
    expect((await getPlayer(db, "hal"))?.preferredPosition).not.toBe("Lock");
  });
});

describe("getPlayer", () => {
  it("includes the Player's duty record", async () => {
    const db = await setup();
    const player = await getPlayer(db, "hal");
    expect(player?.dutyRecord.season).toEqual({ done: 0, neverConfirmed: 0 });
    expect(player?.dutyRecord.upcoming).toEqual([]);
  });

  it("is undefined for a User who doesn't exist", async () => {
    const db = await setup();
    expect(await getPlayer(db, "nobody")).toBeUndefined();
  });
});

describe("time Away", () => {
  const today = "2026-10-10";
  const hal = { id: "hal", role: "member" as const };
  const tom = { id: "tom", role: "committee" as const };
  const exams = { from: "2026-11-03", until: "2026-11-20", reason: "Exams" };

  async function withCommittee() {
    const db = await setup();
    await db.insert(user).values([
      { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "committee" },
      { id: "ann", name: "Ann Admin", email: "ann@x.org", accessState: "approved", role: "admin" },
    ]);
    return db;
  }

  it("lets a Player add their own, then lists it as coming up", async () => {
    const db = await withCommittee();
    expect(await addAway(db, hal, "hal", exams, today)).toMatchObject({ ok: true });
    const away = await listAway(db, hal, "hal", today);
    expect(away.future).toHaveLength(1);
    expect(away.future[0]).toMatchObject({ from: "2026-11-03", until: "2026-11-20", reason: "Exams", setBy: "Hooker Hal" });
  });

  it("rejects bad input", async () => {
    const db = await withCommittee();
    expect(await addAway(db, hal, "hal", { ...exams, reason: "" }, today)).toEqual({ ok: false, error: "Say why you'll be away." });
  });

  it("stops a Member adding for someone else, but lets Committee, showing who set it", async () => {
    const db = await withCommittee();
    expect(await addAway(db, hal, "fran", exams, today)).toMatchObject({ ok: false });
    expect(await addAway(db, tom, "fran", exams, today)).toMatchObject({ ok: true });
    const [period] = (await listAway(db, tom, "fran", today)).future;
    expect(period.setBy).toBe("Tom Hale");
  });

  it("shows nothing of someone else's time Away to a Member", async () => {
    const db = await withCommittee();
    await addAway(db, tom, "fran", exams, today);
    expect(await listAway(db, hal, "fran", today)).toEqual({ current: [], future: [], past: [] });
  });

  it("lets a Player edit their own, not someone else's", async () => {
    const db = await withCommittee();
    const added = await addAway(db, hal, "hal", exams, today);
    if (!added.ok) throw new Error("expected ok");
    expect(await editAway(db, hal, added.id, { ...exams, until: "2026-11-25", reason: "Resits" }, today)).toEqual({ ok: true });
    const [period] = (await listAway(db, hal, "hal", today)).future;
    expect(period).toMatchObject({ until: "2026-11-25", reason: "Resits" });
    expect(await editAway(db, { id: "fran", role: "member" }, added.id, exams, today)).toMatchObject({ ok: false });
  });

  it("ends a current period early with I'm back, keeping it as history", async () => {
    const db = await withCommittee();
    const added = await addAway(db, hal, "hal", { from: "2026-10-05", until: "2026-10-30", reason: "Holiday" }, today);
    if (!added.ok) throw new Error("expected ok");
    expect(await imBack(db, hal, added.id, today)).toEqual({ ok: true });
    const away = await listAway(db, hal, "hal", today);
    expect(away.current).toEqual([]);
    expect(away.past[0]).toMatchObject({ from: "2026-10-05", until: "2026-10-09" });
  });

  it("removes a period that starts today when they're back, since it never really happened", async () => {
    const db = await withCommittee();
    const added = await addAway(db, hal, "hal", { from: today, until: "2026-10-30", reason: "Holiday" }, today);
    if (!added.ok) throw new Error("expected ok");
    await imBack(db, hal, added.id, today);
    expect(await listAway(db, hal, "hal", today)).toEqual({ current: [], future: [], past: [] });
  });

  it("removes a future period, hidden from every list", async () => {
    const db = await withCommittee();
    const added = await addAway(db, hal, "hal", exams, today);
    if (!added.ok) throw new Error("expected ok");
    expect(await removeAway(db, hal, added.id, today)).toEqual({ ok: true });
    expect(await listAway(db, hal, "hal", today)).toEqual({ current: [], future: [], past: [] });
    expect((await listAwayOn(db, ["hal"], "2026-11-05")).size).toBe(0);
  });

  it("keeps past periods: they can't be removed", async () => {
    const db = await withCommittee();
    const added = await addAway(db, hal, "hal", { from: "2026-10-01", until: "2026-10-12", reason: "Trip" }, today);
    if (!added.ok) throw new Error("expected ok");
    const later = "2026-10-20";
    expect(await removeAway(db, hal, added.id, later)).toMatchObject({ ok: false });
    expect((await listAway(db, hal, "hal", later)).past).toHaveLength(1);
  });

  it("finds who is Away on a date, with the period", async () => {
    const db = await withCommittee();
    await addAway(db, hal, "hal", exams, today);
    const away = await listAwayOn(db, ["hal", "fran"], "2026-11-10");
    expect([...away.keys()]).toEqual(["hal"]);
    expect(away.get("hal")).toMatchObject({ reason: "Exams", until: "2026-11-20" });
  });

  it("puts a Player's current or coming period on the Players list", async () => {
    const db = await withCommittee();
    await addAway(db, hal, "hal", exams, today);
    const listing = await listPlayers(db, "", { today });
    const row = listing.playing.find((p) => p.id === "hal");
    expect(row?.awayLabel).toBe("Away from 3 Nov");
    expect(row?.away).toBe(false);
    const during = await listPlayers(db, "", { today: "2026-11-10" });
    expect(during.playing.find((p) => p.id === "hal")).toMatchObject({ awayLabel: "Away until 20 Nov", away: true });
  });

  it("marks someone New when their time Away changed in the last 48 hours", async () => {
    const db = await withCommittee();
    await addAway(db, hal, "hal", exams, today);
    const soon = await listPlayers(db, "", { today, now: new Date(Date.now() + 3_600_000) });
    expect(soon.playing.find((p) => p.id === "hal")?.isNew).toBe(true);
    const later = await listPlayers(db, "", { today, now: new Date(Date.now() + 3 * 86_400_000) });
    expect(later.playing.find((p) => p.id === "hal")?.isNew).toBe(false);
  });

  it("alerts Committee, not the one who made it, when it starts within 14 days", async () => {
    const db = await withCommittee();
    const added = await addAway(db, hal, "hal", { from: "2026-10-20", until: "2026-11-03", reason: "Exams" }, today);
    if (!added.ok) throw new Error("expected ok");
    expect(await awayAlert(db, added.id, today)).toEqual({
      userIds: ["ann", "tom"],
      title: "Hooker Hal will be away from 20 Oct",
      body: "",
      playerId: "hal",
    });
  });

  it("doesn't alert Committee about one that is far off", async () => {
    const db = await withCommittee();
    const added = await addAway(db, hal, "hal", exams, today);
    if (!added.ok) throw new Error("expected ok");
    expect(await awayAlert(db, added.id, today)).toBeNull();
  });

  it("doesn't alert the Committee member who set it themselves", async () => {
    const db = await withCommittee();
    const added = await addAway(db, tom, "hal", { from: today, until: "2026-10-20", reason: "Trip" }, today);
    if (!added.ok) throw new Error("expected ok");
    expect((await awayAlert(db, added.id, today))?.userIds).toEqual(["ann"]);
  });

  it("is wiped with the Player's account", async () => {
    const db = await withCommittee();
    await addAway(db, hal, "hal", exams, today);
    await clearAway(db, "hal");
    expect((await listAwayOn(db, ["hal"], "2026-11-10")).size).toBe(0);
  });
});

describe("listPlayers with Fitness", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const fitness = new Map([
    ["hal", { fitness: "out" as const, line: "Out · ankle (+1)", detail: "Ankle", checkIn: "Out 5 weeks, check in", changedAt: new Date("2026-10-10T10:00:00Z") }],
    ["fran", { fitness: "playing_through" as const, line: "Playing through it · knee", detail: "Knee", checkIn: null, changedAt: new Date("2026-10-01T10:00:00Z") }],
  ]);

  it("carries each Player's Fitness, Injury line and check-in flag, and a New dot for recent changes", async () => {
    const db = await setup();
    const listing = await listPlayers(db, "", { today: "2026-10-10", now, fitness });
    const hal = listing.playing.find((p) => p.id === "hal");
    const fran = listing.playing.find((p) => p.id === "fran");
    expect(hal).toMatchObject({ fitness: "out", injuryLine: "Out · ankle (+1)", checkIn: "Out 5 weeks, check in", isNew: true });
    expect(fran).toMatchObject({ fitness: "playing_through", isNew: false });
    expect(listing.summary).toBe("1 out · 1 playing through it");
  });

  it("filters to the Injured", async () => {
    const db = await setup();
    await db.insert(user).values({ id: "ned", name: "Fit Ned", email: "ned@x.org", accessState: "approved" });
    const listing = await listPlayers(db, "", { today: "2026-10-10", now, fitness, injuredOnly: true });
    expect(listing.playing.map((p) => p.name)).toEqual(["Hooker Hal", "Fly-half Fran"]);
  });
});
