"use client";

import { joinList } from "@/lib/join-names";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, X } from "lucide-react";
import type { Naming, NoticeStatus } from "@/features/selection";
import { formatDay } from "@/lib/format-time";
import { BottomSheet } from "@/components/bottom-sheet";
import type { Result } from "@/lib/result";

type SendResult = Result<{ noticeId: string | null; sending: number }>;

export type NamingActions = {
  name: (eventId: string) => Promise<SendResult>;
  sendChanges: (eventId: string) => Promise<SendResult>;
  dismiss: (eventId: string, noticeId: string) => Promise<Result>;
  retry: (eventId: string, noticeId: string) => Promise<SendResult>;
};

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

function failedMessage(notice: NoticeStatus) {
  const what = notice.kind === "name" ? "team announcement" : "changes";
  const others = notice.sent > 0 ? " Everyone else got it." : "";
  return `${notice.by}'s ${what} didn't reach ${joinList(notice.missed, "and")}.${others}`;
}

/**
 * Checks on a notice every couple of seconds until its emails are done, then swaps its
 * "Telling…" toast for how it went. Keeps going if the board unmounts.
 */
async function watchNotice(noticeId: string, refresh: () => void) {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    let notice: NoticeStatus;
    try {
      const response = await fetch(`/api/notices/${noticeId}`, { cache: "no-store" });
      if (!response.ok) continue;
      notice = await response.json();
    } catch {
      continue;
    }
    if (notice.status === "sending") continue;
    if (notice.status === "sent") toast.success(`Told ${people(notice.sent)}.`, { id: noticeId });
    else toast.error(failedMessage(notice), { id: noticeId });
    refresh();
    return;
  }
}

/** Notify the team (or Send changes) for one Match: who has been told, what's unsent, and how the emails went. */
export function NameTheTeam({ eventId, label, naming, actions, sheet }: { eventId: string; label: string; naming: Naming; actions: NamingActions; sheet: React.ReactNode }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const { named, canName, canSend, missing, unsent, notices } = naming;

  function send(action: () => Promise<SendResult>, verb: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return void toast.error(result.error);
      setConfirming(false);
      if (!result.noticeId) {
        toast.success(verb === "name" ? "Nobody to tell yet." : "Updated the team card. Nobody to tell.");
      } else {
        toast.loading(`Telling ${people(result.sending)}…`, { id: result.noticeId });
        void watchNotice(result.noticeId, router.refresh);
      }
      router.refresh();
    });
  }

  function dismiss(noticeId: string) {
    startTransition(async () => {
      const result = await actions.dismiss(eventId, noticeId);
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  function retry(noticeId: string) {
    startTransition(async () => {
      const result = await actions.retry(eventId, noticeId);
      if (!result.ok) return void toast.error(result.error);
      toast.loading(`Trying ${people(result.sending)} again…`, { id: noticeId });
      void watchNotice(noticeId, router.refresh);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-card">
      {notices.map((notice) =>
        notice.status === "sending" ? (
          <p key={notice.id} role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            Telling {people(notice.total)}…
          </p>
        ) : (
          <div key={notice.id} role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive-text">
            <div className="flex flex-1 flex-col items-start gap-2">
              <p>{failedMessage(notice)}</p>
              <button type="button" onClick={() => retry(notice.id)} disabled={pending} className="rounded-lg bg-destructive/10 px-3 py-1.5 text-sm font-semibold hover:bg-destructive/20 disabled:opacity-60">
                Try again
              </button>
            </div>
            <button type="button" onClick={() => dismiss(notice.id)} disabled={pending} aria-label="Dismiss" className="-m-1 rounded-lg p-1 hover:bg-destructive/10 disabled:opacity-60">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ),
      )}

      {named && (
        <p className="text-xs text-muted-foreground">
          Notified {formatDay(named.at)} by {named.by}
        </p>
      )}

      {canSend && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">
            {unsent.count} {unsent.count === 1 ? "change" : "changes"} not sent yet
          </p>
          <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            {unsent.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={pending}
            onClick={() => send(() => actions.sendChanges(eventId), "changes")}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            Send changes
          </button>
        </div>
      )}

      <div className="flex gap-2">
        {canName && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground"
          >
            <Send className="size-4" aria-hidden="true" />
            Notify the team
          </button>
        )}
        <div className={canName ? undefined : "flex-1 [&>button]:w-full"}>{sheet}</div>
      </div>

      {confirming && (
        <BottomSheet
          eyebrow="Notify the team"
          title={missing.length > 0 ? `Notify the team with ${missing.length} ${missing.length === 1 ? "thing" : "things"} missing?` : `Notify the ${label}?`}
          onSubmit={(e) => {
            e.preventDefault();
            send(() => actions.name(eventId), "name");
          }}
          onClose={() => setConfirming(false)}
        >
          <div className="flex flex-col gap-4">
            {missing.length > 0 && (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                {missing.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted-foreground">Everyone on the sheet, bench included, gets an email and a notification. Guests aren&apos;t told.</p>
            <button
              type="submit"
              disabled={pending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Notify the team
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
