"use client";

import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { joinList } from "@/lib/join-names";
import type { DeliveryProgress } from "@/lib/delivery";

export const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** "Sam's nudge didn't reach Jo and Ray. Everyone else got it." */
export function failedMessage(by: string, what: string, progress: DeliveryProgress) {
  const others = progress.sent > 0 ? " Everyone else got it." : "";
  return `${by}'s ${what} didn't reach ${joinList(progress.missed, "and")}.${others}`;
}

/**
 * Checks on a send every couple of seconds until its emails are done, then swaps its
 * "Emailing…" toast for how it went and refreshes the page. Keeps going if the component
 * unmounts, so the toast still shows after moving to another page.
 */
export async function watchDelivery<T extends DeliveryProgress>(
  url: string,
  id: string,
  say: { sent: (progress: T) => string; failed: (progress: T) => string },
  refresh: () => void,
) {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    let progress: T;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      progress = await response.json();
    } catch {
      continue;
    }
    if (progress.status === "sending") continue;
    if (progress.status === "sent") toast.success(say.sent(progress), { id });
    else toast.error(say.failed(progress), { id });
    refresh();
    return;
  }
}

/** A send still going, or one that didn't reach everyone, until it's dismissed. */
export function DeliveryLine({
  progress,
  sending,
  failed,
  pending,
  onDismiss,
  onRetry,
}: {
  progress: DeliveryProgress;
  /** "Emailing a nudge to 3 people…" */
  sending: string;
  failed: string;
  pending: boolean;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  if (progress.status === "sending") {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        {sending}
      </p>
    );
  }
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive-text">
      <div className="flex flex-1 flex-col items-start gap-2">
        <p>{failed}</p>
        <button type="button" onClick={onRetry} disabled={pending} className="rounded-lg bg-destructive/10 px-3 py-1.5 text-sm font-semibold hover:bg-destructive/20 disabled:opacity-60">
          Try again
        </button>
      </div>
      <button type="button" onClick={onDismiss} disabled={pending} aria-label="Dismiss" className="-m-1 rounded-lg p-1 hover:bg-destructive/10 disabled:opacity-60">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
