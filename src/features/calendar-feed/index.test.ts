import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createEquipmentUnit, raiseQuantity } from "@/features/equipment";
import { cancelEvent, createEvent } from "@/features/events";
import { claimDuty, ensureDuties } from "@/features/duties";
import { blockUser, user } from "@/features/users";
import { deleteFeedToken, getFeedToken, renderFeed, resetFeedToken } from "./index";

const future = (days: number, hours = 18) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000);

async function setup() {
  const db = await createTestDb();
  await db.insert(user).values(
    ["tom", "sam"].map((id) => ({ id, name: id, email: `${id}@x.org`, accessState: "approved" as const })),
  );
  await db.insert(store).values({ id: "shed", name: "Shed", address: "x" });
  const made = await createEquipmentUnit(db, { name: "Ball bag A", homeId: "shed" });
  if (!made.ok) throw new Error(made.error);
  const created = await createEvent(db, {
    eventType: "training",
    start: future(2),
    end: future(2, 20),
    venue: "Har-Ha",
  });
  if (!created.ok) throw new Error(created.error);
  return { db, equipment: made.equipmentUnit, event: created.event };
}

describe("Feed Token", () => {
  it("is created once per User and then stays the same", async () => {
    const { db } = await setup();
    const first = await getFeedToken(db, "tom");
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(await getFeedToken(db, "tom")).toBe(first);
    expect(await getFeedToken(db, "sam")).not.toBe(first);
  });

  it("stops working once reset, and the new one works", async () => {
    const { db } = await setup();
    const old = await getFeedToken(db, "tom");
    const fresh = await resetFeedToken(db, "tom");
    expect(fresh).not.toBe(old);
    expect((await renderFeed(db, old)).status).toBe(404);
    expect((await renderFeed(db, fresh)).status).toBe(200);
  });

  it("stops working once deleted", async () => {
    const { db } = await setup();
    const token = await getFeedToken(db, "tom");
    await deleteFeedToken(db, "tom");
    expect((await renderFeed(db, token)).status).toBe(404);
  });
});

describe("renderFeed", () => {
  it("404s for an unknown token", async () => {
    const { db } = await setup();
    expect((await renderFeed(db, "nope")).status).toBe(404);
  });

  it("lists every Event with its venue name", async () => {
    const { db, event } = await setup();
    const res = await renderFeed(db, await getFeedToken(db, "tom"));
    expect(res.status).toBe(200);
    expect(res.status === 200 && res.body).toContain(`UID:${event.id}@imrfc`);
    expect(res.status === 200 && res.body).toContain("LOCATION:Har-Ha");
  });

  it("writes only the User's own Duties into the description", async () => {
    const { db, equipment, event } = await setup();
    const [toDuty] = (await ensureDuties(db, event.id, [equipment.id])).filter((d) => d.direction === "to");
    await claimDuty(db, toDuty.id, "tom");

    const mine = await renderFeed(db, await getFeedToken(db, "tom"));
    const theirs = await renderFeed(db, await getFeedToken(db, "sam"));
    expect(mine.status === 200 && mine.body).toContain("You're bringing: Ball bag A");
    expect(theirs.status === 200 && theirs.body).not.toContain("Ball bag A");
  });

  it("names the others sharing a Duty: 'with Sam'", async () => {
    const { db, equipment, event } = await setup();
    await db.update(user).set({ name: "Sam Okafor" }).where(eq(user.id, "sam"));
    const [toDuty] = (await ensureDuties(db, event.id, [equipment.id])).filter((d) => d.direction === "to");
    await claimDuty(db, toDuty.id, "tom");
    await claimDuty(db, toDuty.id, "sam");

    const mine = await renderFeed(db, await getFeedToken(db, "tom"));
    expect(mine.status === 200 && mine.body).toContain("You're bringing: Ball bag A with Sam Okafor");
  });

  it("shows the count in the description when the Equipment Unit's Quantity is more than 1", async () => {
    const { db, equipment, event } = await setup();
    await raiseQuantity(db, equipment.id, "tom", 7); // Quantity now 8
    const [toDuty] = (await ensureDuties(db, event.id, [equipment.id])).filter((d) => d.direction === "to");
    await claimDuty(db, toDuty.id, "tom");

    const mine = await renderFeed(db, await getFeedToken(db, "tom"));
    expect(mine.status === 200 && mine.body).toContain("You're bringing: Ball bag A ×8");
  });

  it("marks a Cancelled Event STATUS:CANCELLED", async () => {
    const { db, event } = await setup();
    await cancelEvent(db, event.id);
    const res = await renderFeed(db, await getFeedToken(db, "tom"));
    expect(res.status === 200 && res.body).toContain("STATUS:CANCELLED");
  });

  it("is 410 Gone for a Blocked User", async () => {
    const { db } = await setup();
    const token = await getFeedToken(db, "tom");
    await blockUser(db, "tom");
    expect((await renderFeed(db, token)).status).toBe(410);
  });
});

describe("Query efficiency", () => {
  /** Counts the db's `select` calls from here on, so a fix can't reintroduce a query per row. */
  function countSelects(db: { select: (...args: unknown[]) => unknown }): () => number {
    const original = db.select.bind(db);
    let count = 0;
    (db as { select: (...args: unknown[]) => unknown }).select = (...args: unknown[]) => {
      count++;
      return original(...args);
    };
    return () => count;
  }

  it("renders a feed without one query per Duty in it", async () => {
    const { db, event } = await setup();
    const { addToChecklist } = await import("@/features/checklists");
    const addClaimedDuty = async (name: string) => {
      const unit = await createEquipmentUnit(db, { name, homeId: "shed" });
      if (!unit.ok) throw new Error(unit.error);
      await addToChecklist(db, { scope: "event", scopeId: event.id }, unit.equipmentUnit.id);
      const [dutyRow] = (await ensureDuties(db, event.id, [unit.equipmentUnit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, dutyRow.id, "tom");
    };
    const token = await getFeedToken(db, "tom");

    await addClaimedDuty("Equipment A");
    const fewSelects = countSelects(db);
    await renderFeed(db, token);
    const selectsWithOneDuty = fewSelects();

    for (let i = 0; i < 8; i++) await addClaimedDuty(`Equipment ${i}`);
    const manySelects = countSelects(db);
    await renderFeed(db, token);
    expect(manySelects()).toBe(selectsWithOneDuty);
  });
});
