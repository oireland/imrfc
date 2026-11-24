import webpush from "web-push";

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string };

/** Thrown when the browser reports a subscription as gone (410/404) — the caller should drop it. */
export class PushSubscriptionGoneError extends Error {}

export interface PushSender {
  send(subscription: PushSubscriptionKeys, message: PushMessage): Promise<void>;
}

/** Logs to the console instead of sending — used in tests. */
export const consolePushSender: PushSender = {
  async send(subscription, message) {
    console.log(`[push] to=${subscription.endpoint} title=${message.title}`);
  },
};

/** Sends over Web Push (VAPID) — no third-party service needed. */
function webPushSender(): PushSender {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return {
    async send(subscription, message) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(message),
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) throw new PushSubscriptionGoneError(subscription.endpoint);
        throw error;
      }
    },
  };
}

/** Picks the push sender for the current environment: console in tests, Web Push otherwise. */
export function getPushSender(): PushSender {
  if (process.env.NODE_ENV === "test" || !process.env.VAPID_PRIVATE_KEY) return consolePushSender;
  return webPushSender();
}
