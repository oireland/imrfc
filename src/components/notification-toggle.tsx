"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { unsubscribeThisDevice } from "@/lib/messaging/push-client";
import { Button } from "@/components/ui/button";

type Subscription = { endpoint: string; p256dh: string; auth: string };

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Profile's Notifications on/off switch. It reflects this browser's own subscription, not any device's. */
export function NotificationToggle({
  vapidPublicKey,
  subscribe,
  unsubscribe,
  isThisDeviceSubscribed,
}: {
  vapidPublicKey: string;
  subscribe: (subscription: Subscription) => Promise<void>;
  unsubscribe: (endpoint: string) => Promise<void>;
  isThisDeviceSubscribed: (endpoint: string) => Promise<boolean>;
}) {
  // null while we find out whether this browser is subscribed.
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let subscribed = false;
      try {
        if ("serviceWorker" in navigator && "PushManager" in window) {
          const registration = await navigator.serviceWorker.ready;
          const existing = await registration.pushManager.getSubscription();
          subscribed = existing ? await isThisDeviceSubscribed(existing.endpoint) : false;
        }
      } catch {
        subscribed = false;
      }
      if (!cancelled) setOn(subscribed);
    })();
    return () => {
      cancelled = true;
    };
  }, [isThisDeviceSubscribed]);
  const [pending, startTransition] = useTransition();

  async function turnOn() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast("Notifications aren't supported on this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast("Notifications need permission — you can turn this on again once you've allowed them.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const pushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const json = pushSubscription.toJSON();
    await subscribe({ endpoint: json.endpoint!, p256dh: json.keys!.p256dh, auth: json.keys!.auth });
    setOn(true);
  }

  async function turnOff() {
    await unsubscribeThisDevice(unsubscribe);
    setOn(false);
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending || on === null}
      onClick={() => startTransition(async () => {
        try {
          await (on ? turnOff() : turnOn());
        } catch {
          toast("Couldn't change your notification setting — try again.");
        }
      })}
    >
      {on ? "Turn notifications off" : "Turn notifications on"}
    </Button>
  );
}
