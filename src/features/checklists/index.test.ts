import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createEquipmentUnit, raiseQuantity, setEquipmentStatus } from "@/features/equipment";
import { user } from "@/features/users";
import {
  addToChecklist,
  getChecklist,
  removeFromChecklist,
  resolveEventChecklist,
  setChecklistItemCount,
} from "./index";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  const [shed] = await db
    .insert(store)
    .values({ id: "s1", name: "Shed", address: "x" })
    .returning();
  const make = async (name: string, quantity?: number) => {
    const r = await createEquipmentUnit(db, { name, homeId: shed.id, quantity });
    if (!r.ok) throw new Error(r.error);
    return r.equipmentUnit;
  };
  return { db, balls: await make("Balls"), cones: await make("Cones") };
}

describe("Checklists", () => {
  it("starts with no Checklist at a level", async () => {
    const { db } = await setup();
    expect(await getChecklist(db, { scope: "series", scopeId: "s" })).toBeUndefined();
  });

  it("adds and removes Equipment Units, ignoring duplicates, defaulting to 'all'", async () => {
    const { db, balls, cones } = await setup();
    const scope = { scope: "event_type", scopeId: "training" } as const;

    await addToChecklist(db, scope, balls.id);
    await addToChecklist(db, scope, balls.id);
    await addToChecklist(db, scope, cones.id);
    await removeFromChecklist(db, scope, balls.id);

    expect(await getChecklist(db, scope)).toEqual([{ equipmentUnitId: cones.id, count: null }]);
  });

  it("only lets Active Equipment Units onto a Checklist", async () => {
    const { db, balls } = await setup();
    await setEquipmentStatus(db, balls.id, "missing");

    const result = await addToChecklist(db, { scope: "event", scopeId: "e" }, balls.id);

    expect(result).toEqual({ ok: false, error: "Missing or retired equipment can't go on the list." });
    expect(await getChecklist(db, { scope: "event", scopeId: "e" })).toBeUndefined();
  });

  it("resolves Event, then Series, then Default", async () => {
    const { db, balls, cones } = await setup();
    await addToChecklist(db, { scope: "event_type", scopeId: "training" }, balls.id);
    const ref = { eventId: "e1", seriesId: "s1", eventType: "training" };

    expect(await resolveEventChecklist(db, ref)).toEqual({
      source: "default",
      items: [{ equipmentUnitId: balls.id, count: 1 }],
    });

    await addToChecklist(db, { scope: "series", scopeId: "s1" }, cones.id);
    expect(await resolveEventChecklist(db, ref)).toEqual({
      source: "series",
      items: [{ equipmentUnitId: cones.id, count: 1 }],
    });

    await addToChecklist(db, { scope: "event", scopeId: "e1" }, balls.id);
    expect(await resolveEventChecklist(db, ref)).toEqual({
      source: "event",
      items: [{ equipmentUnitId: balls.id, count: 1 }],
    });
  });

  it("resolves an Event with no seriesId without a Series level", async () => {
    const { db } = await setup();
    expect(await resolveEventChecklist(db, { eventId: "e", seriesId: null, eventType: "social" })).toEqual({
      source: "none",
      items: [],
    });
  });

  it("sets a line's count and caps it at the Equipment Unit's Quantity when resolved", async () => {
    const { db, balls } = await setup();
    await db.insert(user).values({ id: "admin", name: "Admin", email: "admin@x.org", accessState: "approved" });
    await raiseQuantity(db, balls.id, "admin", 7); // Quantity now 8
    const scope = { scope: "event_type", scopeId: "training" } as const;
    await addToChecklist(db, scope, balls.id);

    await setChecklistItemCount(db, scope, balls.id, 4);
    expect(await getChecklist(db, scope)).toEqual([{ equipmentUnitId: balls.id, count: 4 }]);
    expect(await resolveEventChecklist(db, { eventId: "e1", seriesId: null, eventType: "training" })).toEqual({
      source: "default",
      items: [{ equipmentUnitId: balls.id, count: 4 }],
    });

    await setChecklistItemCount(db, scope, balls.id, 20);
    expect(await resolveEventChecklist(db, { eventId: "e1", seriesId: null, eventType: "training" })).toEqual({
      source: "default",
      items: [{ equipmentUnitId: balls.id, count: 8 }],
    });

    await setChecklistItemCount(db, scope, balls.id, null);
    expect(await resolveEventChecklist(db, { eventId: "e1", seriesId: null, eventType: "training" })).toEqual({
      source: "default",
      items: [{ equipmentUnitId: balls.id, count: 8 }],
    });
  });
});
