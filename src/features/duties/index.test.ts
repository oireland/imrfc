import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { location } from "@/features/locations";
import { createKitUnit } from "@/features/kit";
import { user } from "@/features/users";
import {
  assignDuty,
  claimDuty,
  ensureDuties,
  handOnDuty,
  setDestination,
  unassignDuty,
  type Duty,
} from "./index";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values(
    ["tom", "sam", "priya"].map((id) => ({ id, name: id, email: `${id}@x.org`, accessState: "approved" as const })),
  );
  const [shed, cupboard] = await db
    .insert(location)
    .values([
      { id: "shed", name: "Shed", address: "x", isVenue: false, isStore: true },
      { id: "cupboard", name: "Cupboard", address: "x", isVenue: false, isStore: true },
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

    expect(await claimDuty(db, to.id, "sam")).toEqual({ ok: false, error: "That Duty is already taken." });
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
      error: "You can only hand on your own Duty.",
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
      error: "Only a From Duty has a Destination.",
    });
  });
});
