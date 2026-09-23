import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { location } from "@/features/locations";
import { createKitUnit, listKitUnits, setConditionNote, setKitStatus } from "./index";

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

describe("createKitUnit", () => {
  it("creates an Active Kit Unit with a Home", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);

    const result = await createKitUnit(db, { name: "Ball bag A", homeId: home.id });

    expect(result.ok).toBe(true);
    const units = await listKitUnits(db);
    expect(units).toMatchObject([{ name: "Ball bag A", status: "active", homeId: home.id }]);
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
  it("updates a Kit Unit's Condition Note", async () => {
    const db = await createTestDb();
    await migrate(db);
    const home = await seedHome(db);
    const created = await createKitUnit(db, { name: "Ball bag A", homeId: home.id });
    if (!created.ok) throw new Error("expected Kit Unit to be created");

    await setConditionNote(db, created.kitUnit.id, "2 balls need pumping");

    const [unit] = await listKitUnits(db);
    expect(unit.conditionNote).toBe("2 balls need pumping");
  });
});
