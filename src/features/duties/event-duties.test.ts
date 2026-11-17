import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createEquipmentUnit } from "@/features/equipment";
import { addToChecklist } from "@/features/checklists";
import { cancelEvent, createEvent } from "@/features/events";
import { user } from "@/features/users";
import { duty } from "./schema";
import { actOnEventDuty, claimDuty, ensureDuties, listEventDuties, voidDutiesForEvent } from "./index";

async function setup() {
  const db = await createTestDb();
  await db.insert(user).values(
    ["tom", "sam"].map((id) => ({ id, name: id, email: `${id}@x.org`, accessState: "approved" as const })),
  );
  const [shed] = await db.insert(store).values({ id: "shed", name: "Shed", address: "x" }).returning();
  const unit = async (name: string) => {
    const made = await createEquipmentUnit(db, { name, homeId: shed.id });
    if (!made.ok) throw new Error(made.error);
    return made.equipmentUnit;
  };
  const balls = await unit("Balls");
  const cones = await unit("Cones");
  const made = await createEvent(db, {
    eventType: "training",
    start: new Date(Date.now() + 48 * 3600_000),
    end: new Date(Date.now() + 50 * 3600_000),
    venue: "Harlington",
  });
  if (!made.ok) throw new Error(made.error);
  const ev = made.event;
  const target = { scope: "event" as const, scopeId: ev.id, inherits: { seriesId: null, eventType: "training" as const } };
  for (const u of [balls, cones]) await addToChecklist(db, target, u.id, null);
  const stored = () => db.select().from(duty);
  return { db, ev, balls, cones, stored };
}

const member = (id: string) => ({ id, role: "member" as const });

describe("listEventDuties", () => {
  it("shows a blank To and From Duty for each Equipment Unit with none yet, and writes nothing", async () => {
    const { db, ev, balls, stored } = await setup();

    const duties = await listEventDuties(db, ev.id, [balls.id], { cancelled: false });

    expect(duties).toHaveLength(2);
    expect(duties.map((d) => d.direction).sort()).toEqual(["from", "to"]);
    expect(duties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          equipmentUnitId: balls.id,
          userIds: [],
          confirmedAt: null,
          voidedAt: null,
          destination: { type: "home" },
        }),
      ]),
    );
    expect(await stored()).toEqual([]);
  });

  it("keeps stored Duties as they are and blanks only the missing ones", async () => {
    const { db, ev, balls, cones } = await setup();
    const [toRow] = (await ensureDuties(db, ev.id, [balls.id])).filter((d) => d.direction === "to");
    await claimDuty(db, toRow.id, "tom");

    const duties = await listEventDuties(db, ev.id, [balls.id, cones.id], { cancelled: false });

    expect(duties).toHaveLength(4);
    const forBalls = duties.filter((d) => d.equipmentUnitId === balls.id);
    expect(forBalls.every((d) => d.userIds.includes("tom"))).toBe(true);
    expect(duties.filter((d) => d.equipmentUnitId === cones.id).every((d) => d.userIds.length === 0)).toBe(true);
  });

  it("reads a missing Duty of a Cancelled Event as voided, like a stored one", async () => {
    const { db, ev, balls, cones } = await setup();
    await ensureDuties(db, ev.id, [balls.id]);
    await cancelEvent(db, ev.id);
    await voidDutiesForEvent(db, ev.id);

    const duties = await listEventDuties(db, ev.id, [balls.id, cones.id], { cancelled: true });

    expect(duties).toHaveLength(4);
    expect(duties.every((d) => d.voidedAt !== null)).toBe(true);
  });
});

describe("actOnEventDuty", () => {
  it("creates the To and From Duties when it acts on a missing one, and From follows To", async () => {
    const { db, ev, balls, stored } = await setup();

    const result = await actOnEventDuty(db, ev.id, balls.id, "to", member("tom"), { action: "claim" });

    expect(result).toEqual({ ok: true });
    expect(await stored()).toHaveLength(2);
    const duties = await listEventDuties(db, ev.id, [balls.id], { cancelled: false });
    expect(duties.map((d) => d.userIds)).toEqual([["tom"], ["tom"]]);
  });

  it("refuses to act on a missing Duty of a Cancelled Event, and creates nothing", async () => {
    const { db, ev, balls, stored } = await setup();
    await cancelEvent(db, ev.id);

    const result = await actOnEventDuty(db, ev.id, balls.id, "to", member("tom"), { action: "claim" });

    expect(result).toMatchObject({ ok: false });
    expect(await stored()).toEqual([]);
  });

  it("refuses Equipment that isn't on the Event's Checklist", async () => {
    const { db, ev, stored } = await setup();
    const other = await createEquipmentUnit(db, { name: "Tees", homeId: "shed" });
    if (!other.ok) throw new Error(other.error);

    const result = await actOnEventDuty(db, ev.id, other.equipmentUnit.id, "to", member("tom"), { action: "claim" });

    expect(result).toMatchObject({ ok: false });
    expect(await stored()).toEqual([]);
  });
});
