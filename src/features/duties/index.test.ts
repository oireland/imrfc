import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createKitUnit, getPortions, listMovementLog, raiseQuantity, recordMove } from "@/features/kit";
import { addToChecklist, setChecklistItemCount } from "@/features/checklists";
import { cancelEvent, createEvent } from "@/features/events";
import { user } from "@/features/users";
import {
  actOnDuty,
  assignDuty,
  claimDuty,
  confirmDuty,
  ensureDuties,
  handOnDuty,
  leaveDuty,
  listClashes,
  listDutyRecordForUser,
  listHeadsUps,
  listUpcomingDutiesForUser,
  setDestination,
  markUnconfirmed,
  releaseDutiesOfBlockedUser,
  voidDutiesForEvent,
  type Duty,
} from "./index";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values(
    ["tom", "sam", "priya"].map((id) => ({ id, name: id, email: `${id}@x.org`, accessState: "approved" as const })),
  );
  const [shed, cupboard] = await db
    .insert(store)
    .values([
      { id: "shed", name: "Shed", address: "x" },
      { id: "cupboard", name: "Cupboard", address: "x" },
    ])
    .returning();
  const made = await createKitUnit(db, { name: "Balls", homeId: shed.id });
  if (!made.ok) throw new Error(made.error);
  const duties = await ensureDuties(db, "e1", [made.kitUnit.id]);
  const pair = (list: Duty[]) => ({
    to: list.find((d) => d.direction === "to")!,
    from: list.find((d) => d.direction === "from")!,
  });
  const reload = async () => pair(await ensureDuties(db, "e1", [made.kitUnit.id]));
  return { db, shed, cupboard, kit: made.kitUnit, ...pair(duties), reload };
}

async function whereaboutsOf(db: Awaited<ReturnType<typeof setup>>["db"], kitUnitId: string) {
  const [portion] = await getPortions(db, kitUnitId);
  return portion;
}

describe("Duties", () => {
  it("gives every Kit Unit on the Checklist one unfilled To Duty and one From Duty, once", async () => {
    const { db, kit, to, from } = await setup();

    expect(to).toMatchObject({ kitUnitId: kit.id, userIds: [] });
    expect(from).toMatchObject({ kitUnitId: kit.id, userIds: [] });
    expect(await ensureDuties(db, "e1", [kit.id])).toHaveLength(2);
  });

  it("returns no Duties for an empty Checklist", async () => {
    const { db } = await setup();
    expect(await ensureDuties(db, "e2", [])).toEqual([]);
  });

  it("Claiming a To Duty sends the From Duty to the same User (From follows To while empty)", async () => {
    const { db, to, reload } = await setup();

    expect(await claimDuty(db, to.id, "tom")).toEqual({ ok: true });

    const after = await reload();
    expect(after.to.userIds).toEqual(["tom"]);
    expect(after.from.userIds).toEqual(["tom"]);
  });

  it("A second person joining the To Duty also joins the From Duty, as long as it's still following", async () => {
    const { db, to, from, reload } = await setup();
    await claimDuty(db, to.id, "tom");

    await claimDuty(db, to.id, "sam");

    const after = await reload();
    expect(after.to.userIds).toEqual(["tom", "sam"]);
    expect(after.from.userIds).toEqual(["tom", "sam"]);
    expect(from).toBeDefined();
  });

  it("Claiming a From Duty leaves the To Duty alone", async () => {
    const { db, from, reload } = await setup();

    await claimDuty(db, from.id, "tom");

    const after = await reload();
    expect(after.from.userIds).toEqual(["tom"]);
    expect(after.to.userIds).toEqual([]);
  });

  it("refuses to claim a Duty you're already on", async () => {
    const { db, to } = await setup();
    await claimDuty(db, to.id, "tom");

    expect(await claimDuty(db, to.id, "tom")).toEqual({ ok: false, error: "You're already on it." });
  });

  it("stops following once the From Duty has been given a different set of People", async () => {
    const { db, to, from, reload } = await setup();
    await claimDuty(db, from.id, "priya");

    await claimDuty(db, to.id, "tom");

    const after = await reload();
    expect(after.to.userIds).toEqual(["tom"]);
    expect(after.from.userIds).toEqual(["priya"]);
  });

  it("Assigning replaces the whole set — adds and removes in one go", async () => {
    const { db, to, reload } = await setup();
    await claimDuty(db, to.id, "tom");

    await assignDuty(db, to.id, ["sam", "priya"]);

    expect((await reload()).to.userIds).toEqual(["sam", "priya"]);
  });

  it("a leave (or hand-on) on the To Duty removes the same person from a still-following From Duty", async () => {
    const { db, to, reload } = await setup();
    await claimDuty(db, to.id, "tom");
    await claimDuty(db, to.id, "sam");

    expect(await leaveDuty(db, to.id, "tom")).toEqual({ ok: true });

    const after = await reload();
    expect(after.to.userIds).toEqual(["sam"]);
    expect(after.from.userIds).toEqual(["sam"]);
  });

  it("refuses to leave a Duty you're not on", async () => {
    const { db, to } = await setup();
    expect(await leaveDuty(db, to.id, "tom")).toEqual({ ok: false, error: "You're not on that duty." });
  });

  it("lets a User hand their own place on, and no one else's", async () => {
    const { db, from, reload } = await setup();
    await claimDuty(db, from.id, "tom");

    expect(await handOnDuty(db, from.id, "sam", "priya")).toEqual({
      ok: false,
      error: "You can only hand on your own place.",
    });
    expect(await handOnDuty(db, from.id, "tom", "priya")).toEqual({ ok: true });

    expect((await reload()).from.userIds).toEqual(["priya"]);
  });

  it("defaults a From Duty's Destination to Home and lets it be changed per Event", async () => {
    const { db, from, cupboard, reload } = await setup();
    expect(from.destination).toEqual({ type: "home" });

    await setDestination(db, from.id, { type: "store", storeId: cupboard.id });
    expect((await reload()).from.destination).toEqual({ type: "store", storeId: cupboard.id });

    await setDestination(db, from.id, { type: "holder" });
    expect((await reload()).from.destination).toEqual({ type: "holder" });

    await setDestination(db, from.id, { type: "home" });
    expect((await reload()).from.destination).toEqual({ type: "home" });
  });

  it("only gives From Duties a Destination", async () => {
    const { db, to } = await setup();

    expect(await setDestination(db, to.id, { type: "holder" })).toEqual({
      ok: false,
      error: "Only the trip back has a destination.",
    });
  });

  describe("Confirm", () => {
    it("a Confirmed To Duty moves the Kit Unit to its Duty's User, logged as a Duty Move", async () => {
      const { db, kit, to } = await setup();
      await claimDuty(db, to.id, "tom");

      expect(await confirmDuty(db, to.id, { id: "tom", role: "member" })).toEqual({ ok: true });

      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "tom", storeId: null });
      expect(await listMovementLog(db, kit.id)).toMatchObject([{ kind: "move", reason: "duty", userId: "tom", toHolderId: "tom" }]);
    });

    it("a Confirmed From Duty moves the Kit Unit to Home by default", async () => {
      const { db, kit, shed, cupboard, to, from } = await setup();
      await recordMove(db, kit.id, "tom", { type: "store", storeId: cupboard.id });
      await claimDuty(db, to.id, "tom");

      await confirmDuty(db, from.id, { id: "tom", role: "member" });

      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "store", storeId: shed.id, holderId: null });
    });

    it("a Confirmed From Duty honours a Store Destination or staying with the Duty's User", async () => {
      const { db, kit, cupboard, to, from } = await setup();
      await claimDuty(db, to.id, "tom");

      await setDestination(db, from.id, { type: "store", storeId: cupboard.id });
      await confirmDuty(db, from.id, { id: "tom", role: "member" });
      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "store", storeId: cupboard.id });

      const other = await ensureDuties(db, "e2", [kit.id]);
      const from2 = other.find((d) => d.direction === "from")!;
      await claimDuty(db, other.find((d) => d.direction === "to")!.id, "sam");
      await setDestination(db, from2.id, { type: "holder" });
      await confirmDuty(db, from2.id, { id: "sam", role: "member" });
      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "sam" });
    });

    it("lets Committee Confirm any Duty but not another member", async () => {
      const { db, kit, to } = await setup();
      await claimDuty(db, to.id, "tom");

      expect(await confirmDuty(db, to.id, { id: "sam", role: "member" })).toMatchObject({ ok: false });
      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "store" });

      expect(await confirmDuty(db, to.id, { id: "sam", role: "committee" })).toEqual({ ok: true });
      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ holderId: "tom" });
    });

    it("refuses an unfilled or already Confirmed Duty", async () => {
      const { db, kit, to } = await setup();

      expect(await confirmDuty(db, to.id, { id: "sam", role: "committee" })).toMatchObject({ ok: false });

      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });
      expect(await confirmDuty(db, to.id, { id: "tom", role: "member" })).toMatchObject({ ok: false });
      expect(await listMovementLog(db, kit.id)).toHaveLength(1);
    });

    it("lets any of several People, not just the confirmer, be a valid confirmer", async () => {
      const { db, kit, to } = await setup();
      await claimDuty(db, to.id, "tom");
      await claimDuty(db, to.id, "sam");

      expect(await confirmDuty(db, to.id, { id: "sam", role: "member" })).toEqual({ ok: true });
      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "sam" });
    });
  });

  describe("Confirm counts and splits", () => {
    async function setupCounted(quantity = 8, count = 4) {
      const db = await createTestDb();
      await migrate(db);
      await db.insert(user).values(
        ["tom", "sam"].map((id) => ({ id, name: id, email: `${id}@x.org`, accessState: "approved" as const })),
      );
      const [shed] = await db.insert(store).values({ id: "shed", name: "Shed", address: "x" }).returning();
      const made = await createKitUnit(db, { name: "Shields", homeId: shed.id });
      if (!made.ok) throw new Error(made.error);
      await raiseQuantity(db, made.kitUnit.id, "tom", quantity - 1); // Quantity now `quantity`, all at the Shed
      const created = await createEvent(db, {
        title: "Match",
        eventType: "training",
        start: new Date(Date.now() + 3600_000),
        end: new Date(Date.now() + 7200_000),
        venue: "Harlington",
      });
      if (!created.ok) throw new Error(created.error);
      await addToChecklist(db, { scope: "event", scopeId: created.event.id }, made.kitUnit.id);
      await setChecklistItemCount(db, { scope: "event", scopeId: created.event.id }, made.kitUnit.id, count);
      const duties = await ensureDuties(db, created.event.id, [made.kitUnit.id]);
      return {
        db,
        shed,
        kit: made.kitUnit,
        event: created.event,
        to: duties.find((d) => d.direction === "to")!,
        from: duties.find((d) => d.direction === "from")!,
      };
    }

    it("moves only the Checklist line's count to the Duty's User on a Confirmed To Duty", async () => {
      const { db, kit, shed, to } = await setupCounted();
      await claimDuty(db, to.id, "tom");

      expect(await confirmDuty(db, to.id, { id: "tom", role: "member" })).toEqual({ ok: true });

      const portions = await getPortions(db, kit.id);
      expect(portions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ whereaboutsType: "store", storeId: shed.id, count: 4 }),
          expect.objectContaining({ whereaboutsType: "holder", holderId: "tom", count: 4 }),
        ]),
      );
    });

    it("moves only the count back from the Duty's User on a Confirmed From Duty", async () => {
      const { db, kit, shed, to, from } = await setupCounted();
      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });

      expect(await confirmDuty(db, from.id, { id: "tom", role: "member" })).toEqual({ ok: true });

      expect(await getPortions(db, kit.id)).toEqual([
        expect.objectContaining({ whereaboutsType: "store", storeId: shed.id, count: 8 }),
      ]);
    });

    it("defaults 'who has how many' to everything with whoever confirms, for several People", async () => {
      const { db, kit, to } = await setupCounted();
      await claimDuty(db, to.id, "tom");
      await claimDuty(db, to.id, "sam");

      expect(await confirmDuty(db, to.id, { id: "sam", role: "member" })).toEqual({ ok: true });

      expect(await getPortions(db, kit.id)).toEqual(
        expect.arrayContaining([expect.objectContaining({ whereaboutsType: "holder", holderId: "sam", count: 4 })]),
      );
    });

    it("honours a given 'who has how many' split across several People", async () => {
      const { db, kit, to } = await setupCounted();
      await claimDuty(db, to.id, "tom");
      await claimDuty(db, to.id, "sam");

      expect(
        await confirmDuty(db, to.id, { id: "sam", role: "member" }, { holders: [{ userId: "tom", count: 3 }, { userId: "sam", count: 1 }] }),
      ).toEqual({ ok: true });

      expect(await getPortions(db, kit.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ whereaboutsType: "holder", holderId: "tom", count: 3 }),
          expect.objectContaining({ whereaboutsType: "holder", holderId: "sam", count: 1 }),
        ]),
      );
    });

    it("rejects a 'who has how many' split that doesn't add up", async () => {
      const { db, to } = await setupCounted();
      await claimDuty(db, to.id, "tom");
      await claimDuty(db, to.id, "sam");

      expect(
        await confirmDuty(db, to.id, { id: "sam", role: "member" }, { holders: [{ userId: "tom", count: 1 }, { userId: "sam", count: 1 }] }),
      ).toEqual({ ok: false, error: "Counts must add up to 4." });
    });

    it("gathers a To Duty's count across several Places, given a where-from split", async () => {
      const { db, kit, shed, to } = await setupCounted(4, 4);
      const [otherStore] = await db.insert(store).values({ id: "cupboard", name: "Cupboard", address: "x" }).returning();
      // Split the shields: 2 at the Shed, 2 at the Cupboard.
      await recordMove(db, kit.id, "tom", { type: "store", storeId: otherStore.id }, "ad_hoc", {
        count: 2,
        from: { type: "store", storeId: shed.id },
      });
      await claimDuty(db, to.id, "tom");

      const result = await confirmDuty(
        db,
        to.id,
        { id: "tom", role: "member" },
        {
          from: [
            { place: { type: "store", storeId: shed.id }, count: 2 },
            { place: { type: "store", storeId: otherStore.id }, count: 2 },
          ],
        },
      );

      expect(result).toEqual({ ok: true });
      expect(await getPortions(db, kit.id)).toEqual([expect.objectContaining({ whereaboutsType: "holder", holderId: "tom", count: 4 })]);
    });

    it("gathers a From Duty's count from each of the Duty's People, when the Destination is a Store", async () => {
      const { db, kit, shed, to, from } = await setupCounted();
      await claimDuty(db, to.id, "tom");
      await claimDuty(db, to.id, "sam");
      await confirmDuty(db, to.id, { id: "tom", role: "member" }, { holders: [{ userId: "tom", count: 3 }, { userId: "sam", count: 1 }] });

      expect(await confirmDuty(db, from.id, { id: "tom", role: "member" })).toEqual({ ok: true });

      expect(await getPortions(db, kit.id)).toEqual([expect.objectContaining({ whereaboutsType: "store", storeId: shed.id, count: 8 })]);
    });

    it("sets final Holders on a From Duty staying with them, defaulting and given a split", async () => {
      const { db, kit, to, from } = await setupCounted(4, 4);
      await claimDuty(db, to.id, "tom");
      await claimDuty(db, to.id, "sam");
      await confirmDuty(db, to.id, { id: "tom", role: "member" }, { holders: [{ userId: "tom", count: 2 }, { userId: "sam", count: 2 }] });
      await setDestination(db, from.id, { type: "holder" });

      expect(
        await confirmDuty(db, from.id, { id: "tom", role: "member" }, { holders: [{ userId: "tom", count: 4 }, { userId: "sam", count: 0 }] }),
      ).toEqual({ ok: true });

      expect(await getPortions(db, kit.id)).toEqual([expect.objectContaining({ whereaboutsType: "holder", holderId: "tom", count: 4 })]);
    });
  });

  it("voiding an Event's Duties stops them being Confirmed", async () => {
    const { db, kit, to } = await setup();
    await claimDuty(db, to.id, "tom");

    await voidDutiesForEvent(db, "e1");

    expect(await confirmDuty(db, to.id, { id: "tom", role: "member" })).toMatchObject({ ok: false });
    expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "store" });
  });

  describe("Unconfirmed", () => {
    async function pastEvent(db: Awaited<ReturnType<typeof setup>>["db"], shedId: string, hoursAgo: number) {
      const made = await createEvent(db, {
        title: "Training",
        eventType: "training",
        start: new Date(Date.now() - (hoursAgo + 2) * 3600_000),
        end: new Date(Date.now() - hoursAgo * 3600_000),
        venue: "Harlington",
      });
      if (!made.ok) throw new Error(made.error);
      return made.event;
    }

    it("shows a Kit Unit picked up for an ended Event as Unconfirmed, last seen there, when its From Duty isn't Confirmed", async () => {
      const { db, shed, kit } = await setup();
      const ev = await pastEvent(db, shed.id, 1);
      const [to] = (await ensureDuties(db, ev.id, [kit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });

      await markUnconfirmed(db);

      expect(await whereaboutsOf(db, kit.id)).toMatchObject({
        whereaboutsType: "unconfirmed",
        lastSeenEventId: ev.id,
        holderId: null,
        storeId: null,
      });
      expect(await listMovementLog(db, kit.id)).toHaveLength(1);
    });

    it("leaves Kit Units alone when the From Duty was Confirmed, the Event hasn't ended, or nothing was picked up", async () => {
      const { db, shed, kit } = await setup();
      const done = await pastEvent(db, shed.id, 5);
      const [to, from] = await ensureDuties(db, done.id, [kit.id]).then((d) => [
        d.find((x) => x.direction === "to")!,
        d.find((x) => x.direction === "from")!,
      ]);
      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });
      await confirmDuty(db, from.id, { id: "tom", role: "member" });
      const ongoing = await createEvent(db, {
        title: "Match",
        eventType: "training",
        start: new Date(Date.now() - 3600_000),
        end: new Date(Date.now() + 3600_000),
        venue: "Harlington",
      });
      if (!ongoing.ok) throw new Error(ongoing.error);
      const [to2] = (await ensureDuties(db, ongoing.event.id, [kit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to2.id, "sam");
      await confirmDuty(db, to2.id, { id: "sam", role: "member" });
      const never = await pastEvent(db, shed.id, 1);
      await ensureDuties(db, never.id, [kit.id]);

      await markUnconfirmed(db);

      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "sam" });
    });

    it("marks only the Checklist line's count Unconfirmed, when the Kit Unit is counted", async () => {
      const { db, shed } = await setup();
      const made = await createKitUnit(db, { name: "Shields", homeId: shed.id });
      if (!made.ok) throw new Error(made.error);
      await raiseQuantity(db, made.kitUnit.id, "tom", 7); // Quantity 8, all at the Shed
      const ev = await pastEvent(db, shed.id, 1);
      await addToChecklist(db, { scope: "event", scopeId: ev.id }, made.kitUnit.id);
      await setChecklistItemCount(db, { scope: "event", scopeId: ev.id }, made.kitUnit.id, 4);
      const [to] = (await ensureDuties(db, ev.id, [made.kitUnit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });

      await markUnconfirmed(db);

      const portions = await getPortions(db, made.kitUnit.id);
      expect(portions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ whereaboutsType: "store", storeId: shed.id, count: 4 }),
          expect.objectContaining({ whereaboutsType: "unconfirmed", lastSeenEventId: ev.id, count: 4 }),
        ]),
      );
    });

    it("gathers Unconfirmed from several of the To Duty's People when it was split among them", async () => {
      const { db, shed } = await setup();
      const made = await createKitUnit(db, { name: "Shields", homeId: shed.id });
      if (!made.ok) throw new Error(made.error);
      await raiseQuantity(db, made.kitUnit.id, "tom", 3); // Quantity 4
      const ev = await pastEvent(db, shed.id, 1);
      await addToChecklist(db, { scope: "event", scopeId: ev.id }, made.kitUnit.id);
      const [to] = (await ensureDuties(db, ev.id, [made.kitUnit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to.id, "tom");
      await claimDuty(db, to.id, "sam");
      await confirmDuty(db, to.id, { id: "tom", role: "member" }, { holders: [{ userId: "tom", count: 3 }, { userId: "sam", count: 1 }] });

      await markUnconfirmed(db);

      const portions = await getPortions(db, made.kitUnit.id);
      expect(portions).toEqual([expect.objectContaining({ whereaboutsType: "unconfirmed", lastSeenEventId: ev.id, count: 4 })]);
    });

    it("is resolved by a later Move", async () => {
      const { db, shed, kit } = await setup();
      const ev = await pastEvent(db, shed.id, 1);
      const [to] = (await ensureDuties(db, ev.id, [kit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });
      await markUnconfirmed(db);

      await recordMove(db, kit.id, "sam", { type: "holder", holderId: "sam" });
      await markUnconfirmed(db);

      expect(await whereaboutsOf(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "sam", lastSeenEventId: null });
    });
  });

  it("releases a Blocked User from their unconfirmed Duties on upcoming Events, keeping past ones, and keeping other People on it", async () => {
    const { db, kit } = await setup();
    const soon = await createEvent(db, {
      title: "Training",
      eventType: "training",
      start: new Date(Date.now() + 3600_000),
      end: new Date(Date.now() + 7200_000),
      venue: "Harlington",
    });
    const past = await createEvent(db, {
      title: "Old",
      eventType: "training",
      start: new Date(Date.now() - 7200_000),
      end: new Date(Date.now() - 3600_000),
      venue: "Harlington",
    });
    if (!soon.ok || !past.ok) throw new Error("setup");
    const future = await ensureDuties(db, soon.event.id, [kit.id]);
    const old = await ensureDuties(db, past.event.id, [kit.id]);
    for (const d of [...future, ...old]) {
      await claimDuty(db, d.id, "tom");
      await claimDuty(db, d.id, "sam");
    }

    await releaseDutiesOfBlockedUser(db, "tom");

    const after = await ensureDuties(db, soon.event.id, [kit.id]);
    expect(after.map((d) => d.userIds)).toEqual([["sam"], ["sam"]]);
    const afterOld = await ensureDuties(db, past.event.id, [kit.id]);
    expect(afterOld.map((d) => d.userIds)).toEqual([["tom", "sam"], ["tom", "sam"]]);
  });
});

describe("listUpcomingDutiesForUser", () => {
  async function futureEvent(db: Awaited<ReturnType<typeof setup>>["db"], shedId: string, title: string, hours: number) {
    const made = await createEvent(db, {
      title,
      eventType: "training",
      start: new Date(Date.now() + hours * 3600_000),
      end: new Date(Date.now() + (hours + 1) * 3600_000),
      venue: "Harlington",
    });
    if (!made.ok) throw new Error(made.error);
    return made.event;
  }

  it("lists the User's unconfirmed Duties on upcoming, uncancelled Events, soonest first", async () => {
    const { db, shed, kit } = await setup();
    const later = await futureEvent(db, shed.id, "Later", 48);
    const sooner = await futureEvent(db, shed.id, "Sooner", 24);
    const cancelled = await futureEvent(db, shed.id, "Cancelled", 30);
    const done = await futureEvent(db, shed.id, "Done", 10);
    for (const e of [later, sooner, cancelled, done]) {
      const [to] = (await ensureDuties(db, e.id, [kit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to.id, "tom");
      if (e === done) await confirmDuty(db, to.id, { id: "tom", role: "member" });
    }
    const [samsFrom] = (await ensureDuties(db, sooner.id, [kit.id])).filter((d) => d.direction === "from");
    await handOnDuty(db, samsFrom.id, "tom", "sam");
    await cancelEvent(db, cancelled.id);
    await voidDutiesForEvent(db, cancelled.id);

    const mine = await listUpcomingDutiesForUser(db, "tom");

    expect(mine.map((m) => `${m.event.title} ${m.duty.direction}`)).toEqual([
      "Done from",
      "Sooner to",
      "Later to",
      "Later from",
    ]);
    expect(mine[1].duty).toMatchObject({ userIds: ["tom"], direction: "to", kitUnitId: kit.id });
  });
});

describe("actOnDuty", () => {
  const member = (id: string) => ({ id, role: "member" as const });
  const committee = (id: string) => ({ id, role: "committee" as const });

  it("does what the viewer is allowed to do", async () => {
    const { db, reload } = await setup();
    const { to } = await reload();

    expect(await actOnDuty(db, to.id, member("sam"), { action: "claim" })).toEqual({ ok: true });
    expect(await actOnDuty(db, to.id, member("sam"), { action: "handOn", userId: "tom" })).toEqual({ ok: true });

    expect((await reload()).to.userIds).toEqual(["tom"]);
  });

  it("refuses what the viewer isn't allowed to do", async () => {
    const { db, reload } = await setup();
    const { to, from } = await reload();

    expect(await actOnDuty(db, to.id, member("sam"), { action: "assign", userIds: ["tom"] })).toEqual({
      ok: false,
      error: "You can't do that on this duty.",
    });
    expect(
      await actOnDuty(db, from.id, member("sam"), { action: "setDestination", destination: { type: "holder" } }),
    ).toMatchObject({ ok: false });
    expect((await reload()).to.userIds).toEqual([]);
  });

  it("lets Committee assign (add and remove) and set where kit goes back to", async () => {
    const { db, cupboard, reload } = await setup();
    const { to, from } = await reload();

    await actOnDuty(db, to.id, committee("priya"), { action: "assign", userIds: ["tom"] });
    await actOnDuty(db, from.id, committee("priya"), {
      action: "setDestination",
      destination: { type: "store", storeId: cupboard.id },
    });
    // Give the From Duty its own, different People first, so it stops following the To Duty.
    await actOnDuty(db, from.id, committee("priya"), { action: "assign", userIds: ["priya"] });
    await actOnDuty(db, to.id, committee("priya"), { action: "assign", userIds: [] });

    const after = await reload();
    expect(after.to.userIds).toEqual([]);
    expect(after.from).toMatchObject({ userIds: ["priya"], destination: { type: "store", storeId: cupboard.id } });
  });

  it("confirms a Duty", async () => {
    const { db, reload } = await setup();
    const { to } = await reload();
    await actOnDuty(db, to.id, member("sam"), { action: "claim" });

    expect(await actOnDuty(db, to.id, member("sam"), { action: "confirm" })).toEqual({ ok: true });
    expect((await reload()).to.confirmedAt).not.toBeNull();
  });
});

describe("Clashes and heads-ups", () => {
  async function soonEventNeedingKit() {
    const { db, kit } = await setup();
    const { addToChecklist } = await import("@/features/checklists");
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const made = await createEvent(db, {
      title: "Training",
      eventType: "training",
      start: soon,
      end: new Date(soon.getTime() + 2 * 60 * 60 * 1000),
      venue: "Harlington",
    });
    if (!made.ok) throw new Error(made.error);
    await addToChecklist(db, { scope: "event", scopeId: made.event.id }, kit.id);
    const duties = await ensureDuties(db, made.event.id, [kit.id]);
    return { db, kit, event: made.event, duties };
  }

  it("doesn't count unfilled Duties as Clashes", async () => {
    const { db } = await soonEventNeedingKit();

    expect(await listClashes(db)).toEqual([]);
  });

  it("gives a heads-up about unfilled Duties across upcoming Events from the database", async () => {
    const { db, kit, event } = await soonEventNeedingKit();

    expect(await listHeadsUps(db)).toEqual([
      {
        kind: "unfilled_duty",
        kitUnitId: kit.id,
        eventIds: [event.id],
        message: "Nobody is taking Balls to or back from Training, and it starts within 48 hours.",
      },
    ]);
  });

  it("names people in heads-ups", async () => {
    const { db, kit, duties } = await soonEventNeedingKit();
    await db.update(user).set({ name: "Sam Okafor" }).where(eq(user.id, "sam"));
    await db.update(user).set({ name: "Tom Reed" }).where(eq(user.id, "tom"));
    await recordMove(db, kit.id, "sam", { type: "holder", holderId: "sam" });
    await assignDuty(db, duties.find((d) => d.direction === "to")!.id, ["tom"]);

    expect((await listHeadsUps(db)).map((h) => h.message)).toEqual([
      "Sam Okafor needs to pass Balls to Tom Reed before Training.",
    ]);
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

  it("resolves the kit plan's portions in one query, however many kit units there are", async () => {
    const { db, shed } = await setup();
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const made = await createEvent(db, {
      title: "Training",
      eventType: "training",
      start: soon,
      end: new Date(soon.getTime() + 2 * 60 * 60 * 1000),
      venue: "Harlington",
    });
    if (!made.ok) throw new Error(made.error);
    const addUnit = async (name: string) => {
      const unit = await createKitUnit(db, { name, homeId: shed.id });
      if (!unit.ok) throw new Error(unit.error);
    };

    const fewSelects = countSelects(db);
    await listClashes(db);
    const selectsWithOneUnit = fewSelects();

    for (let i = 0; i < 8; i++) await addUnit(`Bulk ${i}`);
    const manySelects = countSelects(db);
    await listClashes(db);
    expect(manySelects()).toBe(selectsWithOneUnit);
  });

  it("resolves a user's upcoming duties without one checklist/kit query per duty", async () => {
    const { db, shed } = await setup();
    const { addToChecklist } = await import("@/features/checklists");
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const made = await createEvent(db, {
      title: "Training",
      eventType: "training",
      start: soon,
      end: new Date(soon.getTime() + 2 * 60 * 60 * 1000),
      venue: "Harlington",
    });
    if (!made.ok) throw new Error(made.error);
    // Several Kit Units on the same Event's Checklist, each giving Sam a Duty:
    // this isolates "one query per duty" from the (expected) one resolve per Event.
    const addClaimedDuty = async (name: string) => {
      const unit = await createKitUnit(db, { name, homeId: shed.id });
      if (!unit.ok) throw new Error(unit.error);
      await addToChecklist(db, { scope: "event", scopeId: made.event.id }, unit.kitUnit.id);
      const [dutyRow] = await ensureDuties(db, made.event.id, [unit.kitUnit.id]);
      await claimDuty(db, dutyRow.id, "sam");
    };

    await addClaimedDuty("Kit A");
    const fewSelects = countSelects(db);
    await listUpcomingDutiesForUser(db, "sam");
    const selectsWithOneDuty = fewSelects();

    for (let i = 0; i < 8; i++) await addClaimedDuty(`Kit ${i}`);
    const manySelects = countSelects(db);
    await listUpcomingDutiesForUser(db, "sam");
    expect(manySelects()).toBe(selectsWithOneDuty);
  });

  async function makeEndedPickedUpDutiesDb(count: number) {
    const { db, shed } = await setup();
    const ev = await createEvent(db, {
      title: "Training",
      eventType: "training",
      start: new Date(Date.now() - 3 * 3600_000),
      end: new Date(Date.now() - 3600_000),
      venue: "Harlington",
    });
    if (!ev.ok) throw new Error(ev.error);
    for (let i = 0; i < count; i++) {
      const unit = await createKitUnit(db, { name: `Kit ${i}`, homeId: shed.id });
      if (!unit.ok) throw new Error(unit.error);
      const [to] = (await ensureDuties(db, ev.event.id, [unit.kitUnit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });
    }
    return db;
  }

  it("marks Kit Units Unconfirmed after an ended Event without one checklist/kit query per Duty", async () => {
    const oneDuty = await makeEndedPickedUpDutiesDb(1);
    const fewSelects = countSelects(oneDuty);
    await markUnconfirmed(oneDuty);
    const selectsWithOneDuty = fewSelects();

    const nineDuties = await makeEndedPickedUpDutiesDb(9);
    const manySelects = countSelects(nineDuties);
    await markUnconfirmed(nineDuties);
    // Each Kit Unit still needs its own portions reloaded right before `setUnconfirmed`
    // writes it — that's one query per write, not the ~7 per Duty this used to cost.
    expect(manySelects() - selectsWithOneDuty).toBeLessThanOrEqual(8);
  });

  async function makeUpcomingClaimedDutiesDb(count: number, claimant: string) {
    const { db, shed } = await setup();
    const ev = await createEvent(db, {
      title: "Training",
      eventType: "training",
      start: new Date(Date.now() + 3600_000),
      end: new Date(Date.now() + 7200_000),
      venue: "Harlington",
    });
    if (!ev.ok) throw new Error(ev.error);
    for (let i = 0; i < count; i++) {
      const unit = await createKitUnit(db, { name: `Kit ${i}`, homeId: shed.id });
      if (!unit.ok) throw new Error(unit.error);
      const [to] = (await ensureDuties(db, ev.event.id, [unit.kitUnit.id])).filter((d) => d.direction === "to");
      await claimDuty(db, to.id, claimant);
    }
    return db;
  }

  it("checks each upcoming Duty for a Blocked User without one query per Duty", async () => {
    // Nobody here is "tom", so `removeUser` is never called — this isolates the filter step's cost.
    const oneDuty = await makeUpcomingClaimedDutiesDb(1, "sam");
    const fewSelects = countSelects(oneDuty);
    await releaseDutiesOfBlockedUser(oneDuty, "tom");
    const selectsWithOneDuty = fewSelects();

    const nineDuties = await makeUpcomingClaimedDutiesDb(9, "sam");
    const manySelects = countSelects(nineDuties);
    await releaseDutiesOfBlockedUser(nineDuties, "tom");
    expect(manySelects()).toBe(selectsWithOneDuty);
  });
});

describe("listDutyRecordForUser", () => {
  async function pastEvent(db: Awaited<ReturnType<typeof setup>>["db"], title: string, end: Date) {
    const made = await createEvent(db, { title, eventType: "training", start: new Date(end.getTime() - 3600_000), end, venue: "Harlington" });
    if (!made.ok) throw new Error(made.error);
    return made.event;
  }

  it("splits this season's Duties into done and never confirmed, leaves out Cancelled Events, and lists the last 5", async () => {
    const { db, shed } = await setup();
    const now = new Date("2025-11-01T12:00:00Z");

    // Claiming a To Duty also joins its From Duty ("From follows To"); leave it again so
    // each Event contributes a single Duty here, keeping the counts easy to read.
    async function claimToOnly(eventId: string, kitUnitId: string) {
      const [to, from] = await ensureDuties(db, eventId, [kitUnitId]);
      await claimDuty(db, to.direction === "to" ? to.id : from.id, "tom");
      await leaveDuty(db, to.direction === "from" ? to.id : from.id, "tom");
      return to.direction === "to" ? to : from;
    }

    const done = await pastEvent(db, "Done", new Date("2025-10-01T12:00:00Z"));
    const unitA = await createKitUnit(db, { name: "Balls A", homeId: shed.id });
    if (!unitA.ok) throw new Error(unitA.error);
    const toA = await claimToOnly(done.id, unitA.kitUnit.id);
    await confirmDuty(db, toA.id, { id: "tom", role: "member" });

    const neverConfirmed = await pastEvent(db, "Never confirmed", new Date("2025-10-08T12:00:00Z"));
    const unitB = await createKitUnit(db, { name: "Balls B", homeId: shed.id });
    if (!unitB.ok) throw new Error(unitB.error);
    await claimToOnly(neverConfirmed.id, unitB.kitUnit.id);

    const cancelled = await pastEvent(db, "Cancelled", new Date("2025-10-15T12:00:00Z"));
    await cancelEvent(db, cancelled.id);
    const unitC = await createKitUnit(db, { name: "Balls C", homeId: shed.id });
    if (!unitC.ok) throw new Error(unitC.error);
    await claimToOnly(cancelled.id, unitC.kitUnit.id);

    const lastSeason = await pastEvent(db, "Last season", new Date("2024-10-01T12:00:00Z"));
    const unitD = await createKitUnit(db, { name: "Balls D", homeId: shed.id });
    if (!unitD.ok) throw new Error(unitD.error);
    await claimToOnly(lastSeason.id, unitD.kitUnit.id);

    const record = await listDutyRecordForUser(db, "tom", now);

    expect(record.season).toEqual({ done: 1, neverConfirmed: 1 });
    expect(record.last.map((r) => r.event.title)).toEqual(["Never confirmed", "Done", "Last season"]);
  });
});
