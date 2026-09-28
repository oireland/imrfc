import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { user } from "@/features/users";
import {
  createEquipmentUnit,
  deleteEquipmentUnit,
  getPortions,
  listEquipmentHeldBy,
  listEquipmentUnits,
  listMovementLog,
  lowerQuantity,
  raiseQuantity,
  recordMove,
  setConditionNote,
  setEquipmentStatus,
  setQuantity,
  setUnconfirmed,
} from "./index";

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

describe("deleteEquipmentUnit", () => {
  it("removes an Equipment Unit and its Portions for good, e.g. one added by mistake", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");

    await deleteEquipmentUnit(db, created.equipmentUnit.id);

    expect(await listEquipmentUnits(db, { includeRetired: true })).toEqual([]);
    expect(await getPortions(db, created.equipmentUnit.id)).toEqual([]);
  });

  it("also removes its Movement Log entries", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createEquipmentUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Equipment Unit to be created");
    await setConditionNote(db, created.equipmentUnit.id, alex.id, "typo, deleting");

    await deleteEquipmentUnit(db, created.equipmentUnit.id);

    expect(await listMovementLog(db, created.equipmentUnit.id)).toEqual([]);
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
      { kind: "move", reason: "ad_hoc", count: 1, toType: "holder", toHolderId: alex.id },
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
    // on top of the ad-hoc setup Move from the top of the test.
    expect(log).toHaveLength(2);
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
    expect(log[0]).toMatchObject({ count: 2, conditionNote: "Bought 2" });
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
    expect(log[0]).toMatchObject({ count: 2, conditionNote: "Lost 2" });
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
    expect((await listMovementLog(db, id))[0]).toMatchObject({ count: 2, conditionNote: "Bought 2" });
  });

  it("lowers to the new Quantity, logged as lost", async () => {
    const { db, alex, id } = await seedShields(8);

    const result = await setQuantity(db, id, alex.id, 5);

    expect(result.ok).toBe(true);
    expect((await listEquipmentUnits(db))[0].quantity).toBe(5);
    expect((await listMovementLog(db, id))[0]).toMatchObject({ count: 3, conditionNote: "Lost 3" });
  });

  it("does nothing when the Quantity is unchanged", async () => {
    const { db, alex, id } = await seedShields(8);

    const result = await setQuantity(db, id, alex.id, 8);

    expect(result.ok).toBe(true);
    expect(await listMovementLog(db, id)).toEqual([]);
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
