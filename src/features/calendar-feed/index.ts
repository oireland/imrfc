import type { Db } from "@/db/types";
import { eq } from "drizzle-orm";
import { listUpcomingDutiesForUser, othersOnDuty } from "@/features/duties";
import { listEvents } from "@/features/events";
import { listEquipmentUnits } from "@/features/equipment";
import { loadNames, user } from "@/features/users";
import { buildCalendar, type FeedEvent } from "./ics-rules";
import { feedToken } from "./schema";

export { feedToken } from "./schema";


export type FeedResult = { status: 200; body: string } | { status: 404 | 410 };

const newToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");

/** The User's Feed Token, created on first use. */
export async function getFeedToken(db: Db, userId: string): Promise<string> {
  await db.insert(feedToken).values({ userId, token: newToken() }).onConflictDoNothing();
  const [row] = await db.select().from(feedToken).where(eq(feedToken.userId, userId));
  return row.token;
}

/** Replaces the User's Feed Token; the old URL stops working. */
export async function resetFeedToken(db: Db, userId: string): Promise<string> {
  const token = newToken();
  await db
    .insert(feedToken)
    .values({ userId, token })
    .onConflictDoUpdate({ target: feedToken.userId, set: { token, createdAt: new Date() } });
  return token;
}

/** Removes the User's Feed Token, e.g. when their account is deleted; the URL stops working. */
export async function deleteFeedToken(db: Db, userId: string) {
  await db.delete(feedToken).where(eq(feedToken.userId, userId));
}

/** The ICS for a Feed Token: all Events, with the token owner's own Duties in each description. */
export async function renderFeed(db: Db, token: string, now: Date = new Date()): Promise<FeedResult> {
  const [owner] = await db
    .select({ id: user.id, accessState: user.accessState })
    .from(feedToken)
    .innerJoin(user, eq(feedToken.userId, user.id))
    .where(eq(feedToken.token, token));
  if (!owner) return { status: 404 };
  if (owner.accessState === "blocked") return { status: 410 };

  const [upcoming, past, equipment, duties, name] = await Promise.all([
    listEvents(db, { when: "upcoming" }),
    listEvents(db, { when: "past" }),
    listEquipmentUnits(db, { includeRetired: true }),
    listUpcomingDutiesForUser(db, owner.id),
    loadNames(db),
  ]);
  const equipmentById = new Map(equipment.map((k) => [k.id, k]));
  const equipmentLabel = (equipmentUnitId: string, count: number) => {
    const unit = equipmentById.get(equipmentUnitId);
    return unit && unit.quantity > 1 ? `${unit.name} ×${count}` : (unit?.name ?? "Equipment");
  };
  // A shared Duty reads as everyone's: "You're bringing: Tackle shields ×4 with Sam".
  const withOthers = (userIds: string[]) => {
    const others = othersOnDuty(userIds, owner.id, name);
    return others ? ` ${others}` : "";
  };

  const events: FeedEvent[] = [...past, ...upcoming].map((e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end,
    startTbc: e.startTbc,
    venue: e.venue,
    cancelled: e.cancelled,
    description: duties
      .filter((d) => d.event.id === e.id)
      .map(
        ({ duty, count }) =>
          `${duty.direction === "to" ? "You're bringing" : "You're taking back"}: ${equipmentLabel(duty.equipmentUnitId, count)}${withOthers(duty.userIds)}`,
      )
      .join("\n"),
  }));
  return { status: 200, body: buildCalendar(events, now) };
}
