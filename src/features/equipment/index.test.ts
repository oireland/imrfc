import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { listStores, store } from "@/features/stores";
import { user } from "@/features/users";
import { event } from "@/features/events";
import {
  createEquipmentUnit,
  getPortions,
  hasEquipmentUnconfirmedAt,
  listEquipmentHeldBy,
  listEquipmentUnits,
  listMovementLog,
  lowerQuantity,
  raiseQuantity,
  recordMove,
  recordSplitMove,
  replayWhereabouts,
  retireEquipmentUnit,
  archiveStoreIfUnused,
  setConditionNote,
  setEquipmentStatus,
  setQuantity,
  setUnconfirmed,
} from "./index";
import { sameWhereabouts } from "./ledger";

async function seedHome(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [row] = await db
    .insert(store)
    .values({
      id: crypto.randomUUID(),
      name: "Equipment shed",
      address: "SW7",
    })
    .returning();
  return row;
}

async function seedEvent(db: Awaited<ReturnType<typeof createTestDb>>, id = "event-1") {
  const start = new Date("2026-01-10T10:00:00Z");
  await db.insert(event).values({ id, title: "Training", eventType: "training", start, end: new Date(start.getTime() + 3_600_000), venue: "Harlington" });
}

async function seedUser(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [row] = await db
    .insert(user)
    .values({
      id: crypto.randomUUID(),
      name: "Alex",
      email: `${crypto.randomUUID()}@example.com`,
    })
    .returning();
  return row;
}

describe("createEquipmentUnit", () => {
  it("creates an Active Equipment Unit with a Home, Quantity 1 by default, and one Portion", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);

    const result = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });

    expect(result.ok).toBe(true);
    const units = await listEquipmentUnits(db);
    expect(units).toMatchObject([{ name: "Ball bag A", status: "active", homeId: home.id, quantity: 1 }]);
    if (!result.ok) return;
    expect(await getPortions(db, result.equipmentUnit.id)).toMatchObject([
      { count: 1, whereaboutsType: "store", storeId: home.id },
    ]);
  });

  it("creates an Equipment Unit with a Quantity greater than 1, all at Home", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);

    const result = await createEquipmentUnit(db, { name: "Tackle shields", homeId: home.id, quantity: 8 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.equipmentUnit.quantity).toBe(8);
    expect(await getPortions(db, result.equipmentUnit.id)).toMatchObject([
      { count: 8, whereaboutsType: "store", storeId: home.id },
    ]);
  });

  it("rejects an Equipment Unit without a name", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);

    const result = await createEquipmentUnit(db, { name: "", homeId: home.id });

    expect(result.ok).toBe(false);
    expect(await listEquipmentUnits(db)).toEqual([]);
  });
});

describe("listEquipmentUnits", () => {
  it("excludes Retired Equipment Units by default", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    const created = await createEquipmentUnit(db, { name: "Old shields", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    await setEquipmentStatus(db, created.equipmentUnit.id, "retired");

    const units = await listEquipmentUnits(db);

    expect(units.map((u: { name: string }) => u.name)).toEqual(["Ball bag A"]);
  });

  it("includes Retired Equipment Units when asked", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const created = await createEquipmentUnit(db, { name: "Old shields", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    await setEquipmentStatus(db, created.equipmentUnit.id, "retired");

    const units = await listEquipmentUnits(db, { includeRetired: true });

    expect(units.map((u: { name: string }) => u.name)).toEqual(["Old shields"]);
  });
});

describe("setEquipmentStatus", () => {
  it("changes an Equipment Unit's Equipment Status", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    await setEquipmentStatus(db, created.equipmentUnit.id, "missing");

    const [unit] = await listEquipmentUnits(db, { includeRetired: true });
    expect(unit.status).toBe("missing");
  });
});

describe("retireEquipmentUnit", () => {
  it("takes an Equipment Unit out of circulation but keeps its Portions and history", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    await setConditionNote(db, created.equipmentUnit.id, alex.id, "added twice by mistake");

    expect(await retireEquipmentUnit(db, created.equipmentUnit.id)).toEqual({ ok: true });

    expect(await listEquipmentUnits(db)).toEqual([]);
    expect(await listEquipmentUnits(db, { includeRetired: true })).toMatchObject([{ status: "retired" }]);
    expect(await getPortions(db, created.equipmentUnit.id)).toMatchObject([{ count: 1, storeId: home.id }]);
    expect((await listMovementLog(db, created.equipmentUnit.id)).map((e) => e.kind)).toEqual(["condition_note", "added"]);
  });

  it("says so when the Equipment Unit doesn't exist", async () => {
    const db = await createTestDb();
    await migrate(db);
    expect((await retireEquipmentUnit(db, "nope")).ok).toBe(false);
  });
});

describe("Moves in a hurry", () => {
  it("rejects a non-positive or fractional count without changing the Quantity", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    const id = created.equipmentUnit.id;

    for (const count of [-3, 0, 1.5]) {
      const result = await recordMove(db, id, alex.id, { type: "holder", holderId: alex.id }, "ad_hoc", {
        count,
        from: { type: "store", storeId: home.id },
      });
      expect(result.ok).toBe(false);
    }

    expect((await getPortions(db, id)).reduce((n, p) => n + p.count, 0)).toBe(1);
    expect((await listMovementLog(db, id)).map((e) => e.kind)).toEqual(["added"]);
  });

  it("keeps the counts right when several Moves of one Equipment Unit happen at once", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const people = await Promise.all([seedUser(db), seedUser(db), seedUser(db), seedUser(db)]);
    const created = await createEquipmentUnit(db, { name: "Cones", homeId: home.id, quantity: 8 });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    const id = created.equipmentUnit.id;

    const results = await Promise.all(
      people.map((p) =>
        recordMove(db, id, alex.id, { type: "holder", holderId: p.id }, "ad_hoc", {
          count: 2,
          from: { type: "store", storeId: home.id },
        }),
      ),
    );

    expect(results.every((r) => r.ok)).toBe(true);
    const portions = await getPortions(db, id);
    expect(portions.reduce((n, p) => n + p.count, 0)).toBe(8);
    for (const p of people) expect(portions.find((x) => x.holderId === p.id)?.count).toBe(2);
  });
});

describe("setConditionNote", () => {
  it("updates an Equipment Unit's Condition Note and logs the change", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    await setConditionNote(db, created.equipmentUnit.id, alex.id, "2 balls need pumping");

    const [unit] = await listEquipmentUnits(db);
    expect(unit.conditionNote).toBe("2 balls need pumping");

    const log = await listMovementLog(db, created.equipmentUnit.id);
    expect(log).toMatchObject([
      { kind: "condition_note", userId: alex.id, conditionNote: "2 balls need pumping" },
      { kind: "added", count: 1, toStoreId: home.id },
    ]);
  });
});

describe("recordMove", () => {
  it("records 'I've got it': Whereabouts becomes the Holder", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    await recordMove(db, created.equipmentUnit.id, alex.id, { type: "holder", holderId: alex.id });

    const portions = await getPortions(db, created.equipmentUnit.id);
    expect(portions).toMatchObject([{ whereaboutsType: "holder", holderId: alex.id, storeId: null }]);

    const log = await listMovementLog(db, created.equipmentUnit.id);
    expect(log).toMatchObject([
      { kind: "move", reason: "ad_hoc", count: 1, fromStoreId: home.id, toType: "holder", toHolderId: alex.id },
      { kind: "added" },
    ]);
  });

  it("records 'put it in [Store]': Whereabouts becomes the Store", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const otherStore = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    await recordMove(db, created.equipmentUnit.id, alex.id, { type: "holder", holderId: alex.id });

    await recordMove(db, created.equipmentUnit.id, alex.id, {
      type: "store",
      storeId: otherStore.id,
    });

    const portions = await getPortions(db, created.equipmentUnit.id);
    expect(portions).toMatchObject([{ whereaboutsType: "store", storeId: otherStore.id, holderId: null }]);
  });

  it("moves only the given count from the given Place, for a split Equipment Unit", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const sam = await seedUser(db);
    const tom = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Tackle shields", homeId: home.id, quantity: 8 });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    const equipmentUnitId = created.equipmentUnit.id;
    await recordMove(db, equipmentUnitId, sam.id, { type: "holder", holderId: sam.id }, "ad_hoc", {
      count: 4,
      from: { type: "store", storeId: home.id },
    });

    await recordMove(db, equipmentUnitId, sam.id, { type: "holder", holderId: tom.id }, "ad_hoc", {
      count: 2,
      from: { type: "holder", holderId: sam.id },
    });

    const portions = await getPortions(db, equipmentUnitId);
    expect(portions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 4, whereaboutsType: "store", storeId: home.id }),
        expect.objectContaining({ count: 2, whereaboutsType: "holder", holderId: sam.id }),
        expect.objectContaining({ count: 2, whereaboutsType: "holder", holderId: tom.id }),
      ]),
    );
    expect(portions).toHaveLength(3);
  });
});

describe("recordSplitMove", () => {
  it("gathers from several sources and splits across several targets, logging one entry per flow", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const sam = await seedUser(db);
    const tom = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Tackle shields", homeId: home.id, quantity: 4 });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    const equipmentUnitId = created.equipmentUnit.id;
    await recordMove(db, equipmentUnitId, sam.id, { type: "holder", holderId: sam.id }, "ad_hoc", {
      count: 2,
      from: { type: "store", storeId: home.id },
    });
    // Now split 2 at Home, 2 with Sam.

    const { recordSplitMove } = await import("./index");
    const result = await recordSplitMove(db, equipmentUnitId, sam.id, "duty", {
      sources: [
        { from: { type: "holder", holderId: sam.id }, count: 2 },
        { from: { type: "store", storeId: home.id }, count: 2 },
      ],
      targets: [
        { to: { type: "holder", holderId: sam.id }, count: 2 },
        { to: { type: "holder", holderId: tom.id }, count: 2 },
      ],
    });

    expect(result).toEqual({ ok: true });
    const portions = await getPortions(db, equipmentUnitId);
    expect(portions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 2, whereaboutsType: "holder", holderId: sam.id }),
        expect.objectContaining({ count: 2, whereaboutsType: "holder", holderId: tom.id }),
      ]),
    );
    expect(portions).toHaveLength(2);
    const log = await listMovementLog(db, equipmentUnitId);
    // No log entry for Sam's own portion (it stayed with them) — only Home → Tom is a real Move,
    // on top of the ad-hoc setup Move from the top of the test and the starting stock.
    expect(log).toHaveLength(3);
    expect(log[0]).toMatchObject({ kind: "move", reason: "duty", count: 2, fromType: "store", toHolderId: tom.id });
  });

  it("rejects when a source place doesn't have enough", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const sam = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    const { recordSplitMove } = await import("./index");
    const result = await recordSplitMove(db, created.equipmentUnit.id, sam.id, "duty", {
      sources: [{ from: { type: "holder", holderId: sam.id }, count: 1 }],
      targets: [{ to: { type: "holder", holderId: sam.id }, count: 1 }],
    });

    expect(result).toEqual({ ok: false, error: "There aren't 1 there to move." });
  });
});

describe("setUnconfirmed", () => {
  it("moves the whole Quantity to Unconfirmed with no source given", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    await seedEvent(db);
    await setUnconfirmed(db, created.equipmentUnit.id, "event-1");

    const portions = await getPortions(db, created.equipmentUnit.id);
    expect(portions).toMatchObject([{ whereaboutsType: "unconfirmed", lastSeenEventId: "event-1", count: 1 }]);
  });
});

describe("raiseQuantity", () => {
  it("raises the Quantity and adds the extra count at Home, logging why", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Tackle shields", homeId: home.id, quantity: 6 });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    const result = await raiseQuantity(db, created.equipmentUnit.id, alex.id, 2);

    expect(result.ok).toBe(true);
    const units = await listEquipmentUnits(db);
    expect(units[0].quantity).toBe(8);
    const portions = await getPortions(db, created.equipmentUnit.id);
    expect(portions).toMatchObject([{ count: 8, whereaboutsType: "store", storeId: home.id }]);
    const log = await listMovementLog(db, created.equipmentUnit.id);
    expect(log[0]).toMatchObject({ kind: "bought", count: 2, conditionNote: null });
  });
});

describe("lowerQuantity", () => {
  it("lowers the Quantity, removing count from the only Place automatically", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Tackle shields", homeId: home.id, quantity: 8 });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    const result = await lowerQuantity(db, created.equipmentUnit.id, alex.id, 2);

    expect(result.ok).toBe(true);
    const units = await listEquipmentUnits(db);
    expect(units[0].quantity).toBe(6);
    const portions = await getPortions(db, created.equipmentUnit.id);
    expect(portions).toMatchObject([{ count: 6 }]);
    const log = await listMovementLog(db, created.equipmentUnit.id);
    expect(log[0]).toMatchObject({ kind: "lost", count: 2, conditionNote: null });
  });

  it("rejects lowering below 1", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    const result = await lowerQuantity(db, created.equipmentUnit.id, alex.id, 1);

    expect(result).toEqual({ ok: false, error: "Can't lower an equipment unit's quantity below 1." });
  });
});

describe("setQuantity", () => {
  async function seedShields(quantity: number) {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Tackle shields", homeId: home.id, quantity });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    return { db, alex, id: created.equipmentUnit.id };
  }

  it("raises to the new Quantity, logged as bought", async () => {
    const { db, alex, id } = await seedShields(6);

    const result = await setQuantity(db, id, alex.id, 8);

    expect(result.ok).toBe(true);
    expect((await listEquipmentUnits(db))[0].quantity).toBe(8);
    expect((await listMovementLog(db, id))[0]).toMatchObject({ kind: "bought", count: 2, conditionNote: null });
  });

  it("lowers to the new Quantity, logged as lost", async () => {
    const { db, alex, id } = await seedShields(8);

    const result = await setQuantity(db, id, alex.id, 5);

    expect(result.ok).toBe(true);
    expect((await listEquipmentUnits(db))[0].quantity).toBe(5);
    expect((await listMovementLog(db, id))[0]).toMatchObject({ kind: "lost", count: 3, conditionNote: null });
  });

  it("does nothing when the Quantity is unchanged", async () => {
    const { db, alex, id } = await seedShields(8);

    const result = await setQuantity(db, id, alex.id, 8);

    expect(result.ok).toBe(true);
    expect((await listMovementLog(db, id)).map((e) => e.kind)).toEqual(["added"]);
  });

  it("rejects anything below 1", async () => {
    const { db, alex, id } = await seedShields(8);

    const result = await setQuantity(db, id, alex.id, 0);

    expect(result).toEqual({ ok: false, error: "Can't lower an equipment unit's quantity below 1." });
  });
});

describe("listEquipmentHeldBy", () => {
  it("lists the non-retired Equipment Units whose Holder is the User, with the count held", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const me = await seedUser(db);
    const other = await seedUser(db);
    const make = async (name: string, quantity?: number) => {
      const made = await createEquipmentUnit(db, { name, homeId: home.id, quantity });
      if (!made.ok) throw new Error(made.error);
      return made.equipmentUnit;
    };
    const mine = await make("Mine");
    const retired = await make("Retired");
    const theirs = await make("Theirs");
    const split = await make("Split", 8);
    await make("In store");
    await recordMove(db, mine.id, me.id, { type: "holder", holderId: me.id });
    await recordMove(db, retired.id, me.id, { type: "holder", holderId: me.id });
    await setEquipmentStatus(db, retired.id, "retired");
    await recordMove(db, theirs.id, other.id, { type: "holder", holderId: other.id });
    await recordMove(db, split.id, me.id, { type: "holder", holderId: me.id }, "ad_hoc", {
      count: 4,
      from: { type: "store", storeId: home.id },
    });

    const held = await listEquipmentHeldBy(db, me.id);

    expect(held.map((k) => ({ name: k.name, count: k.count }))).toEqual(
      expect.arrayContaining([
        { name: "Mine", count: 1 },
        { name: "Split", count: 4 },
      ]),
    );
    expect(held.map((k) => k.name)).not.toContain("Retired");
    expect(held.map((k) => k.name)).not.toContain("Theirs");
  });
});

describe("archiveStoreIfUnused", () => {
  it("archives a Store nothing is homed or stored at", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const [spare] = await db.insert(store).values({ id: "spare", name: "Spare", address: "x" }).returning();
    await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });

    expect(await archiveStoreIfUnused(db, spare.id)).toEqual({ ok: true });

    expect(await listStores(db)).toMatchObject([{ id: home.id }]);
  });

  it("refuses a Store that is some Equipment Unit's Home", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });

    const result = await archiveStoreIfUnused(db, home.id);

    expect(result.ok).toBe(false);
    expect(await listStores(db)).toHaveLength(1);
  });

  it("refuses a Store that still has equipment in it, even if it isn't its Home", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const [other] = await db.insert(store).values({ id: "other", name: "Other", address: "x" }).returning();
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("setup");
    await recordMove(db, created.equipmentUnit.id, alex.id, { type: "store", storeId: other.id });

    expect((await archiveStoreIfUnused(db, other.id)).ok).toBe(false);
  });
});

describe("setConditionNote length limit", () => {
  it("refuses a note that's far too long, changing and logging nothing", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    const result = await setConditionNote(db, created.equipmentUnit.id, alex.id, "a".repeat(1001));

    expect(result).toEqual({ ok: false, error: "The note is too long. Keep it to 1000 characters or fewer." });
    expect((await listEquipmentUnits(db))[0].conditionNote).toBe("");
    expect((await listMovementLog(db, created.equipmentUnit.id)).map((e) => e.kind)).toEqual(["added"]);
  });
});

describe("hasEquipmentUnconfirmedAt", () => {
  it("is true only while equipment is Unconfirmed at that Event", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    await seedEvent(db, "event-1");
    await seedEvent(db, "event-2");
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("setup");

    expect(await hasEquipmentUnconfirmedAt(db, "event-1")).toBe(false);
    await setUnconfirmed(db, created.equipmentUnit.id, "event-1");

    expect(await hasEquipmentUnconfirmedAt(db, "event-1")).toBe(true);
    expect(await hasEquipmentUnconfirmedAt(db, "event-2")).toBe(false);
  });
});

describe("the Movement Log is the source of truth", () => {
  async function expectReplayMatches(db: Awaited<ReturnType<typeof createTestDb>>, equipmentUnitId: string) {
    const replayed = await replayWhereabouts(db, equipmentUnitId);
    if (!replayed.ok) throw new Error(replayed.error);
    expect(sameWhereabouts(replayed.portions, await getPortions(db, equipmentUnitId))).toBe(true);
  }

  it("replays to the same Portions after every kind of change to the Whereabouts", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const [other] = await db.insert(store).values({ id: "clubhouse", name: "Clubhouse", address: "W12" }).returning();
    const alex = await seedUser(db);
    const sam = await seedUser(db);
    await seedEvent(db, "match-1");

    const created = await createEquipmentUnit(db, { name: "Cones", homeId: home.id, quantity: 10, addedBy: alex.id });
    if (!created.ok) throw new Error(created.error);
    const id = created.equipmentUnit.id;
    await expectReplayMatches(db, id);

    const atHome = { type: "store" as const, storeId: home.id };
    const withSam = { type: "holder" as const, holderId: sam.id };

    expect(await recordMove(db, id, alex.id, withSam, "ad_hoc", { count: 4, from: atHome })).toEqual({ ok: true });
    await expectReplayMatches(db, id);

    expect(
      await recordSplitMove(db, id, alex.id, "duty", {
        sources: [{ from: atHome, count: 2 }, { from: withSam, count: 1 }],
        targets: [{ to: { type: "store", storeId: other.id }, count: 2 }, { to: { type: "holder", holderId: alex.id }, count: 1 }],
      }),
    ).toEqual({ ok: true });
    await expectReplayMatches(db, id);

    await setUnconfirmed(db, id, "match-1", withSam, 2);
    await expectReplayMatches(db, id);

    expect(await raiseQuantity(db, id, alex.id, 3)).toEqual({ ok: true });
    await expectReplayMatches(db, id);

    expect(await lowerQuantity(db, id, alex.id, 2, { type: "unconfirmed", lastSeenEventId: "match-1" })).toEqual({ ok: true });
    await expectReplayMatches(db, id);

    expect(await setConditionNote(db, id, alex.id, "Two split")).toEqual({ ok: true });
    await expectReplayMatches(db, id);

    // Moving the whole Quantity of a split unit and marking it all Unconfirmed log every Place it left.
    expect(await recordMove(db, id, alex.id, atHome)).toEqual({ ok: true });
    await expectReplayMatches(db, id);
    await recordMove(db, id, alex.id, withSam, "ad_hoc", { count: 5, from: atHome });
    await setUnconfirmed(db, id, "match-1");
    await expectReplayMatches(db, id);
  });

  it("replays a unit whose Quantity is lowered without saying where from", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Bibs", homeId: home.id, quantity: 5, addedBy: alex.id });
    if (!created.ok) throw new Error(created.error);

    expect(await setQuantity(db, created.equipmentUnit.id, alex.id, 3)).toEqual({ ok: true });

    await expectReplayMatches(db, created.equipmentUnit.id);
  });

  it("orders entries made in the same moment by when they were written", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Tackle pad", homeId: home.id, addedBy: alex.id });
    if (!created.ok) throw new Error(created.error);
    const id = created.equipmentUnit.id;
    const withAlex = { type: "holder" as const, holderId: alex.id };

    // One transaction: every entry gets the same created_at.
    await db.transaction(async (tx) => {
      for (let i = 0; i < 5; i++) {
        await recordMove(tx, id, alex.id, withAlex);
        await recordMove(tx, id, alex.id, { type: "store", storeId: home.id });
      }
      await recordMove(tx, id, alex.id, withAlex);
    });

    await expectReplayMatches(db, id);
  });
});
