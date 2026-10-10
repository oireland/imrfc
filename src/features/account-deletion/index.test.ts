import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { store } from "@/features/stores";
import { createEquipmentUnit } from "@/features/equipment";
import { createEvent } from "@/features/events";
import { claimDuty, ensureDuties } from "@/features/duties";
import { getFeedToken, renderFeed } from "@/features/calendar-feed";
import { isSubscribed, subscribe } from "@/features/push";
import { hasMobileNumber, setMobileNumber } from "@/features/contact";
import { listInjuries, reportInjury } from "@/features/injuries";
import { addAway, listAway } from "@/features/players";
import { user } from "@/features/users";
import { deleteAccount } from "./index";

async function setup() {
  const db = await createTestDb();
  await migrate(db);
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved", role: "member" },
    { id: "cat", name: "Cat Jones", email: "cat@x.org", accessState: "approved", role: "committee" },
    { id: "ann", name: "Ann Lee", email: "ann@x.org", accessState: "approved", role: "admin" },
    { id: "bea", name: "Bea Moss", email: "bea@x.org", accessState: "approved", role: "admin" },
  ]);
  return db;
}

const actor = (id: string, role: "member" | "committee" | "admin") => ({ id, role });
const accessStateOf = async (db: Awaited<ReturnType<typeof setup>>, id: string) =>
  (await db.select().from(user).where(eq(user.id, id)))[0].accessState;

describe("deleteAccount", () => {
  it("lets a User delete their own account", async () => {
    const db = await setup();

    expect(await deleteAccount(db, { actor: actor("tom", "member"), userId: "tom" })).toEqual({ ok: true });

    expect(await accessStateOf(db, "tom")).toBe("deleted");
  });

  it("lets an Admin delete a User who isn't an Admin", async () => {
    const db = await setup();

    expect(await deleteAccount(db, { actor: actor("ann", "admin"), userId: "cat" })).toEqual({ ok: true });

    expect(await accessStateOf(db, "cat")).toBe("deleted");
  });

  it("refuses to let an Admin delete another Admin", async () => {
    const db = await setup();

    expect(await deleteAccount(db, { actor: actor("ann", "admin"), userId: "bea" })).toEqual({
      ok: false,
      error: "You can't delete another admin's account.",
    });

    expect(await accessStateOf(db, "bea")).toBe("approved");
  });

  it("refuses anyone else deleting someone's account", async () => {
    const db = await setup();

    expect(await deleteAccount(db, { actor: actor("cat", "committee"), userId: "tom" })).toMatchObject({ ok: false });

    expect(await accessStateOf(db, "tom")).toBe("approved");
  });

  it("refuses an account that's already gone", async () => {
    const db = await setup();
    await deleteAccount(db, { actor: actor("tom", "member"), userId: "tom" });

    expect(await deleteAccount(db, { actor: actor("ann", "admin"), userId: "tom" })).toEqual({
      ok: false,
      error: "That account has already been deleted.",
    });
    expect(await deleteAccount(db, { actor: actor("ann", "admin"), userId: "nobody" })).toEqual({
      ok: false,
      error: "That account has already been deleted.",
    });
  });

  it("takes them off upcoming Duties and stops their Calendar Feed and Push notifications", async () => {
    const db = await setup();
    await db.insert(store).values({ id: "shed", name: "Shed", address: "x" });
    const unit = await createEquipmentUnit(db, { name: "Ball bag A", homeId: "shed" });
    const event = await createEvent(db, {
      eventType: "training",
      start: new Date(Date.now() + 3_600_000),
      end: new Date(Date.now() + 7_200_000),
      venue: "Harlington",
    });
    if (!unit.ok || !event.ok) throw new Error("setup");
    const [toDuty] = await ensureDuties(db, event.event.id, [unit.equipmentUnit.id]);
    await claimDuty(db, toDuty.id, "tom");
    const token = await getFeedToken(db, "tom");
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/tom", p256dh: "k", auth: "a" } });

    await deleteAccount(db, { actor: actor("tom", "member"), userId: "tom" });

    const duties = await ensureDuties(db, event.event.id, [unit.equipmentUnit.id]);
    expect(duties.map((d) => d.userIds)).toEqual([[], []]);
    expect((await renderFeed(db, token)).status).toBe(404);
    expect(await isSubscribed(db, "tom")).toBe(false);
  });

  it("wipes their Mobile number", async () => {
    const db = await setup();
    await setMobileNumber(db, actor("tom", "member"), "tom", "07912 345678");

    await deleteAccount(db, { actor: actor("tom", "member"), userId: "tom" });

    expect(await hasMobileNumber(db, "tom")).toBe(false);
  });

  it("wipes their time Away", async () => {
    const db = await setup();
    const tom = actor("tom", "member");
    await addAway(db, tom, "tom", { from: "2026-11-03", until: "2026-11-20", reason: "Exams" }, "2026-10-10");

    await deleteAccount(db, { actor: tom, userId: "tom" });

    expect(await listAway(db, actor("cat", "committee"), "tom", "2026-10-10")).toEqual({ current: [], future: [], past: [] });
  });

  it("wipes their Injuries", async () => {
    const db = await setup();
    const tom = actor("tom", "member");
    await reportInjury(
      db,
      tom,
      "tom",
      { area: "Knee", description: "", happenedOn: "2026-10-01", eventId: null, status: "out", expectedReturn: null, notSure: true, needsPhysio: false, physioNote: "" },
      "2026-10-10",
    );

    await deleteAccount(db, { actor: tom, userId: "tom" });

    expect(await listInjuries(db, actor("cat", "committee"), "tom", "2026-10-10")).toEqual({ open: [], history: [] });
  });
});
