import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createKitUnit, setKitStatus } from "@/features/kit";
import { addToChecklist, getChecklist, removeFromChecklist, resolveEventChecklist } from "./index";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  const [shed] = await db
    .insert(store)
    .values({ id: "s1", name: "Shed", address: "x" })
    .returning();
  const make = async (name: string) => {
    const r = await createKitUnit(db, { name, homeId: shed.id });
    if (!r.ok) throw new Error(r.error);
    return r.kitUnit;
  };
  return { db, balls: await make("Balls"), cones: await make("Cones") };
}

describe("Checklists", () => {
  it("starts with no Checklist at a level", async () => {
    const { db } = await setup();
    expect(await getChecklist(db, { scope: "series", scopeId: "s" })).toBeUndefined();
  });

  it("adds and removes Kit Units, ignoring duplicates", async () => {
    const { db, balls, cones } = await setup();
    const scope = { scope: "event_type", scopeId: "training" } as const;

    await addToChecklist(db, scope, balls.id);
    await addToChecklist(db, scope, balls.id);
    await addToChecklist(db, scope, cones.id);
    await removeFromChecklist(db, scope, balls.id);

    expect(await getChecklist(db, scope)).toEqual([cones.id]);
  });

  it("only lets Active Kit Units onto a Checklist", async () => {
    const { db, balls } = await setup();
    await setKitStatus(db, balls.id, "missing");

    const result = await addToChecklist(db, { scope: "event", scopeId: "e" }, balls.id);

    expect(result).toEqual({ ok: false, error: "Missing or retired kit can't go on the list." });
    expect(await getChecklist(db, { scope: "event", scopeId: "e" })).toBeUndefined();
  });

  it("resolves Event, then Series, then Default", async () => {
    const { db, balls, cones } = await setup();
    await addToChecklist(db, { scope: "event_type", scopeId: "training" }, balls.id);
    const ref = { eventId: "e1", seriesId: "s1", eventType: "training" };

    expect(await resolveEventChecklist(db, ref)).toEqual({ source: "default", kitUnitIds: [balls.id] });

    await addToChecklist(db, { scope: "series", scopeId: "s1" }, cones.id);
    expect(await resolveEventChecklist(db, ref)).toEqual({ source: "series", kitUnitIds: [cones.id] });

    await addToChecklist(db, { scope: "event", scopeId: "e1" }, balls.id);
    expect(await resolveEventChecklist(db, ref)).toEqual({ source: "event", kitUnitIds: [balls.id] });
  });

  it("resolves an Event with no seriesId without a Series level", async () => {
    const { db } = await setup();
    expect(await resolveEventChecklist(db, { eventId: "e", seriesId: null, eventType: "social" })).toEqual({
      source: "none",
      kitUnitIds: [],
    });
  });
});
