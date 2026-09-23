import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { location } from "@/features/locations";
import { user } from "@/features/users";
import {
  createKitUnit,
  listKitUnits,
  listMovementLog,
  recordMove,
  setConditionNote,
  setKitStatus,
} from "./index";

async function seedHome(db: Awaited<ReturnType<typeof createTestDb>>) {
  const [row] = await db
    .insert(location)
    .values({
      id: crypto.randomUUID(),
      name: "Kit shed",
      address: "SW7",
      isVenue: false,
      isStore: true,
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

describe("createKitUnit", () => {
  it("creates an Active Kit Unit with a Home", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);

    const result = await createKitUnit(db, { name: "Ball bag A", homeId: home.id });

    expect(result.ok).toBe(true);
    const units = await listKitUnits(db);
    expect(units).toMatchObject([
      {
        name: "Ball bag A",
        status: "active",
        homeId: home.id,
        whereaboutsType: "store",
        storeId: home.id,
      },
    ]);
  });

  it("rejects a Kit Unit without a name", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);

    const result = await createKitUnit(db, { name: "", homeId: home.id });

    expect(result.ok).toBe(false);
    expect(await listKitUnits(db)).toEqual([]);
  });
});

describe("listKitUnits", () => {
  it("excludes Retired Kit Units by default", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    await createKitUnit(db, { name: "Ball bag A", homeId: home.id });
    const created = await createKitUnit(db, { name: "Old shields", homeId: home.id });
    if (!created.ok) throw new Error("expected Kit Unit to be created");
    await setKitStatus(db, created.kitUnit.id, "retired");

    const units = await listKitUnits(db);

    expect(units.map((u: { name: string }) => u.name)).toEqual(["Ball bag A"]);
  });

  it("includes Retired Kit Units when asked", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const created = await createKitUnit(db, { name: "Old shields", homeId: home.id });
    if (!created.ok) throw new Error("expected Kit Unit to be created");
    await setKitStatus(db, created.kitUnit.id, "retired");

    const units = await listKitUnits(db, { includeRetired: true });

    expect(units.map((u: { name: string }) => u.name)).toEqual(["Old shields"]);
  });
});

describe("setKitStatus", () => {
  it("changes a Kit Unit's Kit Status", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const created = await createKitUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Kit Unit to be created");

    await setKitStatus(db, created.kitUnit.id, "missing");

    const [unit] = await listKitUnits(db, { includeRetired: true });
    expect(unit.status).toBe("missing");
  });
});

describe("setConditionNote", () => {
  it("updates a Kit Unit's Condition Note and logs the change", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createKitUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Kit Unit to be created");

    await setConditionNote(db, created.kitUnit.id, alex.id, "2 balls need pumping");

    const [unit] = await listKitUnits(db);
    expect(unit.conditionNote).toBe("2 balls need pumping");

    const log = await listMovementLog(db, created.kitUnit.id);
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
    const created = await createKitUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Kit Unit to be created");

    await recordMove(db, created.kitUnit.id, alex.id, { type: "holder", holderId: alex.id });

    const [unit] = await listKitUnits(db);
    expect(unit).toMatchObject({ whereaboutsType: "holder", holderId: alex.id, storeId: null });

    const log = await listMovementLog(db, created.kitUnit.id);
    expect(log).toMatchObject([
      { kind: "move", reason: "ad_hoc", toType: "holder", toHolderId: alex.id },
    ]);
  });

  it("records 'put it in [Store]': Whereabouts becomes the Store", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const otherStore = await seedHome(db);
    const alex = await seedUser(db);
    const created = await createKitUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Kit Unit to be created");
    await recordMove(db, created.kitUnit.id, alex.id, { type: "holder", holderId: alex.id });

    await recordMove(db, created.kitUnit.id, alex.id, {
      type: "store",
      storeId: otherStore.id,
    });

    const [unit] = await listKitUnits(db);
    expect(unit).toMatchObject({
      whereaboutsType: "store",
      storeId: otherStore.id,
      holderId: null,
    });
  });
});
