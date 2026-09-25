import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createKitUnit, getKitUnit, listMovementLog, recordMove } from "@/features/kit";
import { cancelEvent, createEvent } from "@/features/events";
import { user } from "@/features/users";
import {
  actOnDuty,
  assignDuty,
  claimDuty,
  confirmDuty,
  ensureDuties,
  handOnDuty,
  listClashes,
  listHeadsUps,
  listUpcomingDutiesForUser,
  setDestination,
  unassignDuty,
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

describe("Duties", () => {
  it("gives every Kit Unit on the Checklist one unfilled To Duty and one From Duty, once", async () => {
    const { db, kit, to, from } = await setup();

    expect(to).toMatchObject({ kitUnitId: kit.id, userId: null });
    expect(from).toMatchObject({ kitUnitId: kit.id, userId: null });
    expect(await ensureDuties(db, "e1", [kit.id])).toHaveLength(2);
  });

  it("returns no Duties for an empty Checklist", async () => {
    const { db } = await setup();
    expect(await ensureDuties(db, "e2", [])).toEqual([]);
  });

  it("Claiming a To Duty sends the From Duty to the same User", async () => {
    const { db, to, reload } = await setup();

    expect(await claimDuty(db, to.id, "tom")).toEqual({ ok: true });

    const after = await reload();
    expect(after.to.userId).toBe("tom");
    expect(after.from.userId).toBe("tom");
  });

  it("Claiming a From Duty leaves the To Duty alone", async () => {
    const { db, from, reload } = await setup();

    await claimDuty(db, from.id, "tom");

    const after = await reload();
    expect(after.from.userId).toBe("tom");
    expect(after.to.userId).toBeNull();
  });

  it("cannot Claim a Duty that is already filled", async () => {
    const { db, to } = await setup();
    await claimDuty(db, to.id, "tom");

    expect(await claimDuty(db, to.id, "sam")).toEqual({ ok: false, error: "Someone is already doing that." });
  });

  it("Assigning a To Duty fills the From Duty but keeps one already handed to someone else", async () => {
    const { db, to, from, reload } = await setup();
    await assignDuty(db, from.id, "priya");

    await assignDuty(db, to.id, "sam");

    const after = await reload();
    expect(after.to.userId).toBe("sam");
    expect(after.from.userId).toBe("priya");
  });

  it("Assigning replaces whoever held the Duty", async () => {
    const { db, to, reload } = await setup();
    await claimDuty(db, to.id, "tom");

    await assignDuty(db, to.id, "sam");

    expect((await reload()).to.userId).toBe("sam");
  });

  it("lets a User hand their own Duty on, and no one else's", async () => {
    const { db, from, reload } = await setup();
    await claimDuty(db, from.id, "tom");

    expect(await handOnDuty(db, from.id, "sam", "priya")).toEqual({
      ok: false,
      error: "You can only hand on your own duties.",
    });
    expect(await handOnDuty(db, from.id, "tom", "priya")).toEqual({ ok: true });

    expect((await reload()).from.userId).toBe("priya");
  });

  it("unassigns a Duty", async () => {
    const { db, to, reload } = await setup();
    await claimDuty(db, to.id, "tom");

    await unassignDuty(db, to.id);

    expect((await reload()).to.userId).toBeNull();
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

      expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "tom", storeId: null });
      expect(await listMovementLog(db, kit.id)).toMatchObject([{ kind: "move", reason: "duty", userId: "tom", toHolderId: "tom" }]);
    });

    it("a Confirmed From Duty moves the Kit Unit to Home by default", async () => {
      const { db, kit, shed, cupboard, to, from } = await setup();
      await recordMove(db, kit.id, "tom", { type: "store", storeId: cupboard.id });
      await claimDuty(db, to.id, "tom");

      await confirmDuty(db, from.id, { id: "tom", role: "member" });

      expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "store", storeId: shed.id, holderId: null });
    });

    it("a Confirmed From Duty honours a Store Destination or staying with the Duty's User", async () => {
      const { db, kit, cupboard, to, from } = await setup();
      await claimDuty(db, to.id, "tom");

      await setDestination(db, from.id, { type: "store", storeId: cupboard.id });
      await confirmDuty(db, from.id, { id: "tom", role: "member" });
      expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "store", storeId: cupboard.id });

      const other = await ensureDuties(db, "e2", [kit.id]);
      const from2 = other.find((d) => d.direction === "from")!;
      await claimDuty(db, other.find((d) => d.direction === "to")!.id, "sam");
      await setDestination(db, from2.id, { type: "holder" });
      await confirmDuty(db, from2.id, { id: "sam", role: "member" });
      expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "sam" });
    });

    it("lets Committee Confirm any Duty but not another member", async () => {
      const { db, kit, to } = await setup();
      await claimDuty(db, to.id, "tom");

      expect(await confirmDuty(db, to.id, { id: "sam", role: "member" })).toMatchObject({ ok: false });
      expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "store" });

      expect(await confirmDuty(db, to.id, { id: "sam", role: "committee" })).toEqual({ ok: true });
      expect(await getKitUnit(db, kit.id)).toMatchObject({ holderId: "tom" });
    });

    it("refuses an unfilled or already Confirmed Duty", async () => {
      const { db, kit, to } = await setup();

      expect(await confirmDuty(db, to.id, { id: "sam", role: "committee" })).toMatchObject({ ok: false });

      await claimDuty(db, to.id, "tom");
      await confirmDuty(db, to.id, { id: "tom", role: "member" });
      expect(await confirmDuty(db, to.id, { id: "tom", role: "member" })).toMatchObject({ ok: false });
      expect(await listMovementLog(db, kit.id)).toHaveLength(1);
    });
  });

  it("voiding an Event's Duties stops them being Confirmed", async () => {
    const { db, kit, to } = await setup();
    await claimDuty(db, to.id, "tom");

    await voidDutiesForEvent(db, "e1");

    expect(await confirmDuty(db, to.id, { id: "tom", role: "member" })).toMatchObject({ ok: false });
    expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "store" });
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

      expect(await getKitUnit(db, kit.id)).toMatchObject({
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

      expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "sam" });
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

      expect(await getKitUnit(db, kit.id)).toMatchObject({ whereaboutsType: "holder", holderId: "sam", lastSeenEventId: null });
    });
  });

  it("releases a Blocked User's unconfirmed Duties on upcoming Events, keeping past ones", async () => {
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
    for (const d of [...future, ...old]) await claimDuty(db, d.id, "tom");

    await releaseDutiesOfBlockedUser(db, "tom");

    const after = await ensureDuties(db, soon.event.id, [kit.id]);
    expect(after.map((d) => d.userId)).toEqual([null, null]);
    const afterOld = await ensureDuties(db, past.event.id, [kit.id]);
    expect(afterOld.map((d) => d.userId)).toEqual(["tom", "tom"]);
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
    expect(mine[1].duty).toMatchObject({ userId: "tom", direction: "to", kitUnitId: kit.id });
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

    expect((await reload()).to.userId).toBe("tom");
  });

  it("refuses what the viewer isn't allowed to do", async () => {
    const { db, reload } = await setup();
    const { to, from } = await reload();

    expect(await actOnDuty(db, to.id, member("sam"), { action: "assign", userId: "tom" })).toEqual({
      ok: false,
      error: "You can't do that on this duty.",
    });
    expect(
      await actOnDuty(db, from.id, member("sam"), { action: "setDestination", destination: { type: "holder" } }),
    ).toMatchObject({ ok: false });
    expect((await reload()).to.userId).toBeNull();
  });

  it("lets Committee assign, set where kit goes back to, and unassign", async () => {
    const { db, cupboard, reload } = await setup();
    const { to, from } = await reload();

    await actOnDuty(db, to.id, committee("priya"), { action: "assign", userId: "tom" });
    await actOnDuty(db, from.id, committee("priya"), {
      action: "setDestination",
      destination: { type: "store", storeId: cupboard.id },
    });
    await actOnDuty(db, to.id, committee("priya"), { action: "unassign" });

    const after = await reload();
    expect(after.to.userId).toBeNull();
    expect(after.from).toMatchObject({ userId: "tom", destination: { type: "store", storeId: cupboard.id } });
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
    await assignDuty(db, duties.find((d) => d.direction === "to")!.id, "tom");

    expect((await listHeadsUps(db)).map((h) => h.message)).toEqual([
      "Sam Okafor needs to pass Balls to Tom Reed before Training.",
    ]);
  });
});
