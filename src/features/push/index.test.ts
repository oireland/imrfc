import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createEvent, listTeams, type NewEvent } from "@/features/events";
import { claimDuty, ensureDuties } from "@/features/duties";
import { createEquipmentUnit } from "@/features/equipment";
import { store } from "@/features/stores";
import { saveReply } from "@/features/availability";
import { user } from "@/features/users";
import type { PushMessage, PushSender, PushSubscriptionKeys } from "@/lib/push";
import { PushSubscriptionGoneError } from "@/lib/push";
import { isSubscribed, notifyMorningOf, sendToUser, subscribe, unsubscribe, unsubscribeEverywhere } from "./index";

function fakePushSender() {
  const sent: { subscription: PushSubscriptionKeys; message: PushMessage }[] = [];
  const gone = new Set<string>();
  const sender: PushSender = {
    async send(subscription, message) {
      if (gone.has(subscription.endpoint)) throw new PushSubscriptionGoneError(subscription.endpoint);
      sent.push({ subscription, message });
    },
  };
  return { sender, sent, markGone: (endpoint: string) => gone.add(endpoint) };
}

async function setup() {
  const db = await createTestDb();
  await db.insert(user).values([
    { id: "tom", name: "Tom Hale", email: "tom@x.org", accessState: "approved" },
    { id: "sam", name: "Sam Patel", email: "sam@x.org", accessState: "approved" },
  ]);
  await listTeams(db);
  return db;
}

describe("isSubscribed for one device", () => {
  it("is true only for an endpoint this User has subscribed", async () => {
    const db = await setup();
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/phone", p256dh: "k", auth: "a" } });
    expect(await isSubscribed(db, "tom", "https://push/phone")).toBe(true);
    expect(await isSubscribed(db, "tom", "https://push/laptop")).toBe(false);
    expect(await isSubscribed(db, "sam", "https://push/phone")).toBe(false);
  });
});

describe("subscribe / unsubscribe / isSubscribed", () => {
  it("records a subscription and reports it back", async () => {
    const db = await setup();
    expect(await isSubscribed(db, "tom")).toBe(false);

    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/1", p256dh: "key1", auth: "auth1" } });

    expect(await isSubscribed(db, "tom")).toBe(true);
  });

  it("re-subscribing the same endpoint replaces its keys rather than duplicating", async () => {
    const db = await setup();
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/1", p256dh: "old", auth: "old" } });
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/1", p256dh: "new", auth: "new" } });

    const { sender, sent } = fakePushSender();
    await sendToUser(db, "tom", { title: "t", body: "b", url: "/" }, sender);
    expect(sent).toHaveLength(1);
    expect(sent[0].subscription).toMatchObject({ endpoint: "https://push/1", p256dh: "new", auth: "new" });
  });

  it("unsubscribe removes it", async () => {
    const db = await setup();
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/1", p256dh: "k", auth: "a" } });
    await unsubscribe(db, { userId: "tom", endpoint: "https://push/1" });

    expect(await isSubscribed(db, "tom")).toBe(false);
  });

  it("unsubscribeEverywhere removes every one of the User's devices and nobody else's", async () => {
    const db = await setup();
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/1", p256dh: "k", auth: "a" } });
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/2", p256dh: "k", auth: "a" } });
    await subscribe(db, { userId: "sam", subscription: { endpoint: "https://push/3", p256dh: "k", auth: "a" } });

    await unsubscribeEverywhere(db, "tom");

    expect(await isSubscribed(db, "tom")).toBe(false);
    expect(await isSubscribed(db, "sam")).toBe(true);
  });
});

describe("sendToUser", () => {
  it("sends to every one of the User's subscriptions, dropping ones the browser reports gone", async () => {
    const db = await setup();
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/1", p256dh: "k1", auth: "a1" } });
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/2", p256dh: "k2", auth: "a2" } });
    const { sender, sent, markGone } = fakePushSender();
    markGone("https://push/1");

    await sendToUser(db, "tom", { title: "t", body: "b", url: "/" }, sender);

    expect(sent.map((s) => s.subscription.endpoint)).toEqual(["https://push/2"]);
    expect(await isSubscribed(db, "tom")).toBe(true); // /2 is still there
    await unsubscribe(db, { userId: "tom", endpoint: "https://push/2" });
    expect(await isSubscribed(db, "tom")).toBe(false); // /1 was dropped by the gone response
  });
});

async function makeEvent(
  db: Awaited<ReturnType<typeof setup>>,
  overrides: { start: Date; title?: string; eventType?: "training" | "match" | "social" },
) {
  const { start, title, eventType = "training" } = overrides;
  const common = { start, end: new Date(start.getTime() + 3_600_000), venue: eventType === "training" ? (title ?? "Harlington") : "Harlington" };
  const input: NewEvent =
    eventType === "match"
      ? { ...common, eventType, matchDetails: { teamId: "1st XV", opponent: title ?? "Barts", homeAway: "home", competition: "bucs", meetTime: start } }
      : eventType === "social"
        ? { ...common, eventType, title: title ?? "Social" }
        : { ...common, eventType };
  const made = await createEvent(db, input);
  if (!made.ok) throw new Error(made.error);
  return made.event.id;
}

describe("notifyMorningOf", () => {
  it("pushes once to each User with a Duty or an Available reply on today's Events, and nobody else", async () => {
    const db = await setup();
    const now = new Date("2026-10-01T09:00:00Z");
    await subscribe(db, { userId: "tom", subscription: { endpoint: "https://push/tom", p256dh: "k", auth: "a" } });
    await subscribe(db, { userId: "sam", subscription: { endpoint: "https://push/sam", p256dh: "k", auth: "a" } });

    const [shed] = await db.insert(store).values({ id: "shed", name: "Shed", address: "x" }).returning();
    const equipment = await createEquipmentUnit(db, { name: "Balls", homeId: shed.id });
    if (!equipment.ok) throw new Error(equipment.error);
    const todayEventId = await makeEvent(db, { title: "Training", start: new Date("2026-10-01T18:00:00Z") });
    const [to] = await ensureDuties(db, todayEventId, [equipment.equipmentUnit.id]);
    await claimDuty(db, to.id, "tom");
    await saveReply(db, { eventId: todayEventId, playerId: "sam", viewer: { id: "sam", committee: false }, status: "available", note: "", reason: "" }, now);

    // Tomorrow's Event shouldn't generate a push today.
    const tomorrowEventId = await makeEvent(db, { title: "Tomorrow's session", start: new Date("2026-10-02T18:00:00Z") });
    const [toTomorrow] = await ensureDuties(db, tomorrowEventId, [equipment.equipmentUnit.id]);
    await claimDuty(db, toTomorrow.id, "sam");

    const { sender, sent } = fakePushSender();
    const result = await notifyMorningOf(db, now, sender);

    expect(result).toEqual({ notified: 2 });
    const byEndpoint = new Map(sent.map((s) => [s.subscription.endpoint, s.message]));
    expect(byEndpoint.get("https://push/tom")).toEqual({ title: "Today: Training @ Training", body: "You're on duty for it.", url: "/" });
    expect(byEndpoint.get("https://push/sam")).toEqual({ title: "Today: Training @ Training", body: "You said you're in — see you there.", url: "/" });
  });

  it("does nothing when nobody has anything on today", async () => {
    const db = await setup();
    const { sender, sent } = fakePushSender();
    expect(await notifyMorningOf(db, new Date("2026-10-01T09:00:00Z"), sender)).toEqual({ notified: 0 });
    expect(sent).toEqual([]);
  });
});
