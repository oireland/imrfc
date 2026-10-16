import { eq, and } from "drizzle-orm";
import { listDutyUserIdsByEvent } from "@/features/duties";
import { listAvailableUserIds } from "@/features/availability";
import { listEventsBetween, londonParts, londonToUtc } from "@/features/events";
import { PushSubscriptionGoneError, type PushSender, type PushSubscriptionKeys } from "@/lib/push";
import { morningOfMessage, morningOfRecipients } from "./rules";
import { pushSubscription } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Records a device's subscription; re-subscribing the same endpoint replaces its keys. */
export async function subscribe(db: Db, input: { userId: string; subscription: PushSubscriptionKeys }) {
  await db
    .insert(pushSubscription)
    .values({ id: crypto.randomUUID(), userId: input.userId, ...input.subscription, createdAt: new Date() })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { p256dh: input.subscription.p256dh, auth: input.subscription.auth, userId: input.userId },
    });
}

export async function unsubscribe(db: Db, input: { userId: string; endpoint: string }) {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, input.userId), eq(pushSubscription.endpoint, input.endpoint)));
}

/** Removes every one of the User's devices, e.g. when their account is deleted. */
export async function unsubscribeEverywhere(db: Db, userId: string) {
  await db.delete(pushSubscription).where(eq(pushSubscription.userId, userId));
}

/** Whether this User has a device subscribed — or, given an endpoint, that particular device. */
export async function isSubscribed(db: Db, userId: string, endpoint?: string): Promise<boolean> {
  const where = endpoint
    ? and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint))
    : eq(pushSubscription.userId, userId);
  const rows = await db.select({ id: pushSubscription.id }).from(pushSubscription).where(where).limit(1);
  return rows.length > 0;
}

/** Sends to every one of a User's subscribed devices, dropping any the browser reports gone. */
export async function sendToUser(
  db: Db,
  userId: string,
  message: { title: string; body: string; url: string },
  push: PushSender,
): Promise<void> {
  const subscriptions: (typeof pushSubscription.$inferSelect)[] = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));
  for (const subscription of subscriptions) {
    try {
      await push.send(subscription, message);
    } catch (error) {
      if (error instanceof PushSubscriptionGoneError) {
        await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, subscription.endpoint));
      } else {
        console.error(`[push] couldn't reach ${subscription.endpoint}`, error);
      }
    }
  }
}

/**
 * Morning-of reminder: one push per User with a Duty or an Available reply on an Event
 * starting today (Europe/London), summarising every reason in one message.
 */
export async function notifyMorningOf(db: Db, now: Date, push: PushSender): Promise<{ notified: number }> {
  const dayStart = londonToUtc(londonParts(now).date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const events = (await listEventsBetween(db, dayStart, dayEnd)).filter((e) => !e.cancelled);
  if (events.length === 0) return { notified: 0 };

  const eventIds = events.map((e) => e.id);
  const [dutyUserIds, availableUserIds] = await Promise.all([
    listDutyUserIdsByEvent(db, eventIds),
    listAvailableUserIds(db, eventIds),
  ]);
  const recipients = morningOfRecipients({ events, dutyUserIds, availableUserIds });

  for (const [userId, reasons] of recipients) {
    await sendToUser(db, userId, { ...morningOfMessage(reasons), url: "/" }, push);
  }
  return { notified: recipients.size };
}
