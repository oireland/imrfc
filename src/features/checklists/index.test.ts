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
  resolveEventChecklists,
  setChecklistItemCount,
} from "./index";

/** Counts the db's `select` calls from here on. */
function countSelects(db: { select: (...args: unknown[]) => unknown }): () => number {
  const original = db.select.bind(db);
  let count = 0;
  (db as { select: (...args: unknown[]) => unknown }).select = (...args: unknown[]) => {
    count++;
    return original(...args);
  };
  return () => count;
}

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

  it("resolves many Events at once, each by Event, then Series, then Default", async () => {
    const { db, balls, cones } = await setup();
    await addToChecklist(db, { scope: "event_type", scopeId: "training" }, balls.id);
    await addToChecklist(db, { scope: "series", scopeId: "s1" }, cones.id);
    await addToChecklist(db, { scope: "event", scopeId: "own" }, cones.id);
    await addToChecklist(db, { scope: "event", scopeId: "own" }, balls.id);

    const resolved = await resolveEventChecklists(db, [
      { eventId: "plain", seriesId: null, eventType: "training" },
      { eventId: "in-series", seriesId: "s1", eventType: "training" },
      { eventId: "own", seriesId: "s1", eventType: "training" },
      { eventId: "social", seriesId: null, eventType: "social" },
    ]);

    expect(Object.fromEntries(resolved)).toEqual({
      plain: { source: "default", items: [{ equipmentUnitId: balls.id, count: 1 }] },
      "in-series": { source: "series", items: [{ equipmentUnitId: cones.id, count: 1 }] },
      own: {
        source: "event",
        items: expect.arrayContaining([
          { equipmentUnitId: cones.id, count: 1 },
          { equipmentUnitId: balls.id, count: 1 },
        ]),
      },
      social: { source: "none", items: [] },
    });
  });

  it("resolves many Events in the same number of queries as one", async () => {
    const { db, balls } = await setup();
    await addToChecklist(db, { scope: "event_type", scopeId: "training" }, balls.id);
    const events = Array.from({ length: 20 }, (_, i) => ({ eventId: `e${i}`, seriesId: `s${i}`, eventType: "training" }));
    for (const e of events.slice(0, 10)) await addToChecklist(db, { scope: "event", scopeId: e.eventId }, balls.id);

    const one = countSelects(db);
    await resolveEventChecklists(db, events.slice(0, 1));
    const selectsForOne = one();

    const many = countSelects(db);
    await resolveEventChecklists(db, events);
    expect(many()).toBe(selectsForOne);
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

  it("keeps the inherited list when an Event first gets its own", async () => {
    const { db, balls } = await setup();
    await addToChecklist(db, { scope: "event_type", scopeId: "training" }, balls.id, 2);
    const extra = await createEquipmentUnit(db, { name: "Bibs", homeId: "s1" });
    if (!extra.ok) throw new Error(extra.error);

    await addToChecklist(
      db,
      { scope: "event", scopeId: "e1", inherits: { seriesId: null, eventType: "training" } },
      extra.equipmentUnit.id,
    );

    expect(await getChecklist(db, { scope: "event", scopeId: "e1" })).toEqual([
      { equipmentUnitId: balls.id, count: 2 },
      { equipmentUnitId: extra.equipmentUnit.id, count: null },
    ]);
  });

  it("removes one line from an inherited list without losing the rest", async () => {
    const { db, balls, cones } = await setup();
    const defaults = { scope: "event_type", scopeId: "training" } as const;
    await addToChecklist(db, defaults, balls.id);
    await addToChecklist(db, defaults, cones.id);

    await removeFromChecklist(
      db,
      { scope: "event", scopeId: "e1", inherits: { seriesId: null, eventType: "training" } },
      balls.id,
    );

    expect(await getChecklist(db, { scope: "event", scopeId: "e1" })).toEqual([{ equipmentUnitId: cones.id, count: null }]);
    expect(await getChecklist(db, defaults)).toHaveLength(2);
  });

  it("changes a count on an inherited list, starting from the Series' list when it has one", async () => {
    const { db, balls, cones } = await setup();
    await addToChecklist(db, { scope: "event_type", scopeId: "training" }, cones.id);
    await addToChecklist(db, { scope: "series", scopeId: "sr1" }, balls.id);

    await setChecklistItemCount(
      db,
      { scope: "event", scopeId: "e1", inherits: { seriesId: "sr1", eventType: "training" } },
      balls.id,
      1,
    );

    expect(await getChecklist(db, { scope: "event", scopeId: "e1" })).toEqual([{ equipmentUnitId: balls.id, count: 1 }]);
  });
});

describe("Checklist integrity", () => {
  it("rejects a count that isn't a positive whole number", async () => {
    const { db, balls } = await setup();
    const scope = { scope: "event", scopeId: "e1" } as const;

    for (const count of [0, -2, 1.5]) {
      expect((await addToChecklist(db, scope, balls.id, count)).ok).toBe(false);
    }
    expect(await getChecklist(db, scope)).toBeUndefined();

    await addToChecklist(db, scope, balls.id);
    for (const count of [0, -2, 1.5]) {
      expect((await setChecklistItemCount(db, scope, balls.id, count)).ok).toBe(false);
    }
    expect(await getChecklist(db, scope)).toEqual([{ equipmentUnitId: balls.id, count: null }]);
  });

  it("copes with two first edits of the same level at once", async () => {
    const { db, balls, cones } = await setup();
    const scope = { scope: "event", scopeId: "e1" } as const;
    await addToChecklist(db, { scope: "event_type", scopeId: "training" }, balls.id);
    const target = { ...scope, inherits: { seriesId: null, eventType: "training" } };

    const results = await Promise.all([addToChecklist(db, target, cones.id), addToChecklist(db, target, cones.id)]);

    expect(results.every((r) => r.ok)).toBe(true);
    const lines = await getChecklist(db, scope);
    expect(lines?.map((l) => l.equipmentUnitId).sort()).toEqual([balls.id, cones.id].sort());
  });
});
