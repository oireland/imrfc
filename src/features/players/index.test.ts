import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { eraseUser, user } from "@/features/users";
import { getPlayer, listPlayers, setPlaying, setPlayerPositions } from "./index";

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
