import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createKitUnit } from "@/features/kit";
import { cancelEvent, createEvent } from "@/features/events";
import { claimDuty, ensureDuties } from "@/features/duties";
import { blockUser, user } from "@/features/users";
import { getFeedToken, renderFeed, resetFeedToken } from "./index";

const future = (days: number, hours = 18) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000);

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values(
    ["tom", "sam"].map((id) => ({ id, name: id, email: `${id}@x.org`, accessState: "approved" as const })),
  );
  await db.insert(store).values({ id: "shed", name: "Shed", address: "x" });
  const made = await createKitUnit(db, { name: "Ball bag A", homeId: "shed" });
  if (!made.ok) throw new Error(made.error);
  const created = await createEvent(db, {
    title: "Tuesday Training",
    eventType: "training",
    start: future(2),
    end: future(2, 20),
    venue: "Har-Ha",
  });
  if (!created.ok) throw new Error(created.error);
  return { db, kit: made.kitUnit, event: created.event };
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
    const { db, kit, event } = await setup();
    const [toDuty] = (await ensureDuties(db, event.id, [kit.id])).filter((d) => d.direction === "to");
    await claimDuty(db, toDuty.id, "tom");

    const mine = await renderFeed(db, await getFeedToken(db, "tom"));
    const theirs = await renderFeed(db, await getFeedToken(db, "sam"));
    expect(mine.status === 200 && mine.body).toContain("You're bringing: Ball bag A");
    expect(theirs.status === 200 && theirs.body).not.toContain("Ball bag A");
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
