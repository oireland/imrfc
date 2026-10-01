"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Loader2, Megaphone, Send, X } from "lucide-react";
import { cn } from "cn";
import type { AskNotice, Availability, AvailabilityRow, ReplyStatus } from "@/features/availability";
import { formatAgo, formatDay, formatWhen } from "@/lib/format-time";
import { BottomSheet, SheetSaveButton } from "./bottom-sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type Answer = { status: ReplyStatus; note: string; reason: string };
type Result = { ok: true } | { ok: false; error: string };
type SendResult = { ok: true; askId: string; sending: number } | { ok: false; error: string };
type Tab = "in" | "out" | "none";

/**
 * Who can make a Training or Match: your own reply, the counts, and In / Out / No reply
 * lists. Committee can tap anyone to reply for them, and Announce, Nudge or copy a chase
 * message for WhatsApp.
 */
export function AvailabilityCard({
  availability,
  viewerId,
  playing,
  committee,
  now,
  chase,
  reply,
  announce,
  nudge,
  dismiss,
}: {
  availability: Availability;
  viewerId: string;
  playing: boolean;
  committee: boolean;
  now: Date;
  /** The WhatsApp chase message, for Committee while anyone has No reply. */
  chase: string | null;
  reply: (playerId: string, answer: Answer) => Promise<Result>;
  announce: (replyBy: { date: string; time: string } | null) => Promise<SendResult>;
  nudge: (playerIds: string[]) => Promise<SendResult>;
  dismiss: (askId: string) => Promise<Result>;
}) {
  const { summary, myReply, open, canReplyForSelf, canReplyForOthers, announcement, canAnnounce, canNudge, asks } = availability;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("in");
  const [sheet, setSheet] = useState<{ playerId: string; name: string; initial: Answer } | null>(null);
  const [asking, setAsking] = useState<"announce" | "nudge" | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = { in: summary.available, out: summary.notAvailable, none: summary.noReply }[tab];
  const everyone = [...summary.available, ...summary.notAvailable, ...summary.noReply];

  function save(playerId: string, answer: Answer, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await reply(playerId, answer);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      after?.();
    });
  }

  /** Starts an Announce or Nudge, closes the sheet, and leaves the emails sending in the background. */
  function send(action: () => Promise<SendResult>, kind: AskNotice["kind"]) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAsking(null);
      toast.loading(kind === "announce" ? `Emailing ${people(result.sending)}…` : `Nudging ${people(result.sending)}…`, { id: result.askId });
      void watchAsk(result.askId, router.refresh);
    });
  }

  function dismissAsk(askId: string) {
    startTransition(async () => {
      const result = await dismiss(askId);
      if (!result.ok) toast.error(result.error);
    });
  }

  async function copyChase() {
    if (!chase) return;
    try {
      await navigator.clipboard.writeText(chase);
      toast.success("Copied. Paste it into the club group.");
    } catch {
      toast.error("Couldn't copy the message");
    }
  }

  function openSheetFor(row: AvailabilityRow, status?: ReplyStatus) {
    const current = summary.available.includes(row) ? "available" : summary.notAvailable.includes(row) ? "not_available" : undefined;
    setSheet({
      playerId: row.userId,
      name: row.userId === viewerId ? "You" : row.name,
      initial: { status: status ?? current ?? "available", note: row.note, reason: row.reason ?? "" },
    });
  }

  function imIn() {
    // Already in: let them add or change a note instead of saving the same answer again.
    if (myReply?.status === "available") {
      const me = everyone.find((r) => r.userId === viewerId);
      if (me) openSheetFor(me, "available");
      return;
    }
    save(viewerId, { status: "available", note: "", reason: "" }, "You're in");
  }

  function imOut() {
    setSheet({ playerId: viewerId, name: "You", initial: { status: "not_available", note: "", reason: myReply?.reason ?? "" } });
  }

  return (
    <section aria-labelledby="availability" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="availability" className="font-heading text-[28px] leading-none">
          Who&apos;s coming
        </h2>
        <span className="text-sm text-muted-foreground">
          {summary.available.length} in · {summary.notAvailable.length} out · {summary.noReply.length} haven&apos;t said
        </span>
      </div>

      <div className="flex flex-col gap-4 rounded-3xl bg-card px-4 py-4 shadow-card">
        {asks.map((ask) => (
          <AskLine key={ask.id} ask={ask} pending={pending} onDismiss={() => dismissAsk(ask.id)} />
        ))}

        {announcement && (
          <p className="text-xs text-muted-foreground">
            Announced {formatDay(announcement.at)} by {announcement.by}
            {announcement.replyBy && ` · reply by ${formatWhen(announcement.replyBy, now)}`}
          </p>
        )}

        <YourReply
          myReply={myReply}
          open={open}
          playing={playing}
          canReply={canReplyForSelf}
          pending={pending}
          onIn={imIn}
          onOut={imOut}
        />

        <div role="tablist" aria-label="Replies" className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
          {(
            [
              ["in", "In", summary.available.length],
              ["out", "Out", summary.notAvailable.length],
              ["none", "No reply", summary.noReply.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-xl px-2 py-1.5 text-sm font-medium transition-colors",
                tab === key ? "bg-card text-foreground shadow-card" : "text-muted-foreground",
              )}
            >
              {label} <span className="tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={{ in: "In", out: "Out", none: "No reply" }[tab]}>
          {rows.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              {{ in: "Nobody's said they're in yet.", out: "Nobody's said they're out.", none: "Everyone's replied." }[tab]}
            </p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((row) => (
                <li key={row.userId}>
                  <PersonRow
                    row={row}
                    tab={tab}
                    now={now}
                    you={row.userId === viewerId}
                    onTap={canReplyForOthers && row.userId !== viewerId ? () => openSheetFor(row) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
          {committee && canReplyForOthers && rows.length > 0 && (
            <p className="px-1 pt-2 text-xs text-muted-foreground">Heard from someone in person? Tap their name to put their answer in.</p>
          )}
        </div>

        {committee && (canAnnounce || canNudge || chase) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {canAnnounce && (
              <Button type="button" size="sm" onClick={() => setAsking("announce")}>
                <Megaphone aria-hidden="true" />
                Announce
              </Button>
            )}
            {canNudge && (
              <Button type="button" size="sm" variant="outline" onClick={() => setAsking("nudge")}>
                <Send aria-hidden="true" />
                Nudge
              </Button>
            )}
            {chase && (
              <Button type="button" size="sm" variant="outline" onClick={copyChase}>
                <Copy aria-hidden="true" />
                Copy chase message
              </Button>
            )}
          </div>
        )}
      </div>

      {asking === "announce" && (
        <AnnounceSheet
          count={summary.noReply.length}
          pending={pending}
          onClose={() => setAsking(null)}
          onSend={(replyBy) => send(() => announce(replyBy), "announce")}
        />
      )}

      {asking === "nudge" && (
        <NudgeSheet
          rows={summary.noReply}
          now={now}
          pending={pending}
          onClose={() => setAsking(null)}
          onSend={(ids) => send(() => nudge(ids), "nudge")}
        />
      )}

      {sheet && (
        <ReplySheet
          key={sheet.playerId}
          name={sheet.name}
          initial={sheet.initial}
          pending={pending}
          onClose={() => setSheet(null)}
          onSave={(answer) =>
            save(
              sheet.playerId,
              answer,
              sheet.playerId === viewerId
                ? answer.status === "available"
                  ? "You're in"
                  : "Got it, you're out"
                : `Saved for ${sheet.name}`,
              () => setSheet(null),
            )
          }
        />
      )}
    </section>
  );
}

function YourReply({
  myReply,
  open,
  playing,
  canReply,
  pending,
  onIn,
  onOut,
}: {
  myReply: Availability["myReply"];
  open: boolean;
  playing: boolean;
  canReply: boolean;
  pending: boolean;
  onIn: () => void;
  onOut: () => void;
}) {
  if (!playing) {
    return (
      <p className="text-sm text-muted-foreground">
        You&apos;re not down as playing, so there&apos;s nothing to reply to. You can switch playing back on in your profile.
      </p>
    );
  }

  const status = myReply && (
    <p className="text-sm text-muted-foreground">
      {myReply.status === "available" ? "You're in" : "You're out"}
      {myReply.status === "available" && myReply.note && ` · ${myReply.note}`}
      {myReply.status === "not_available" && myReply.reason && ` · ${myReply.reason}`}
      {myReply.setBy && ` · ${myReply.setBy} put you down`}
    </p>
  );

  if (!canReply) {
    return (
      <div className="flex flex-col gap-1">
        {status ?? <p className="text-sm text-muted-foreground">You didn&apos;t reply.</p>}
        {!open && <p className="text-xs text-muted-foreground">Replies have closed.</p>}
      </div>
    );
  }

  const isIn = myReply?.status === "available";
  const isOut = myReply?.status === "not_available";
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">Can you make it?</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onIn}
          disabled={pending}
          aria-pressed={isIn}
          className={cn(
            "flex h-12 items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-60",
            isIn ? "bg-primary text-primary-foreground" : "border border-border bg-card",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          I&apos;m in
        </button>
        <button
          type="button"
          onClick={onOut}
          disabled={pending}
          aria-pressed={isOut}
          className={cn(
            "flex h-12 items-center justify-center gap-2 rounded-2xl text-base font-semibold transition-transform active:scale-[0.98] disabled:opacity-60",
            isOut ? "bg-destructive text-white" : "border border-border bg-card",
          )}
        >
          <X className="size-4" aria-hidden="true" />
          I&apos;m out
        </button>
      </div>
      {status}
    </div>
  );
}

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** "Jo", "Jo and Sam", "Jo, Sam and Ray". */
const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

function failedMessage(ask: AskNotice) {
  const what = ask.kind === "announce" ? "announcement" : "nudge";
  const others = ask.sent > 0 ? ` Everyone else got it.` : "";
  return `${ask.by}'s ${what} didn't reach ${listNames(ask.missed)}.${others}`;
}

/**
 * Checks on an Announce or Nudge every couple of seconds until its emails are done, then
 * swaps its "Emailing…" toast for how it went and refreshes the page. Keeps going if the
 * card unmounts, so the toast still shows after moving to another page.
 */
async function watchAsk(askId: string, refresh: () => void) {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    let ask: AskNotice;
    try {
      const response = await fetch(`/api/asks/${askId}`, { cache: "no-store" });
      if (!response.ok) continue;
      ask = await response.json();
    } catch {
      continue;
    }
    if (ask.status === "sending") continue;
    if (ask.status === "sent") {
      toast.success(ask.kind === "announce" ? `Announced. Emailed ${people(ask.sent)}.` : `Nudged ${people(ask.sent)}.`, { id: askId });
    } else {
      toast.error(failedMessage(ask), { id: askId });
    }
    refresh();
    return;
  }
}

/** An Announce or Nudge still sending, or one that didn't reach everyone, until it's dismissed. */
function AskLine({ ask, pending, onDismiss }: { ask: AskNotice; pending: boolean; onDismiss: () => void }) {
  if (ask.status === "sending") {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        {ask.kind === "announce" ? `Emailing the announcement to ${people(ask.total)}…` : `Emailing a nudge to ${people(ask.total)}…`}
      </p>
    );
  }
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive-text">
      <p className="flex-1">{failedMessage(ask)}</p>
      <button
        type="button"
        onClick={onDismiss}
        disabled={pending}
        aria-label="Dismiss"
        className="-m-1 rounded-lg p-1 hover:bg-destructive/10 disabled:opacity-60"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function PersonRow({ row, tab, now, you, onTap }: { row: AvailabilityRow; tab: Tab; now: Date; you: boolean; onTap?: () => void }) {
  const details = [
    row.note,
    tab === "out" ? row.reason : null,
    row.setBy && `set by ${row.setBy}`,
    row.late && "replied late",
    row.nudgedAt && `nudged ${formatAgo(row.nudgedAt, now)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <StatusMark tab={tab} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {row.name}
          {you && <span className="text-muted-foreground"> (you)</span>}
        </span>
        {details && <span className="block truncate text-xs text-muted-foreground">{details}</span>}
      </span>
    </>
  );
  const className = "flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left";
  return onTap ? (
    <button type="button" onClick={onTap} className={cn(className, "hover:bg-muted")} aria-label={`Reply for ${row.name}`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Solid tick for in, red cross for out, dashed ring for no reply. */
function StatusMark({ tab }: { tab: Tab }) {
  if (tab === "in") {
    return (
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (tab === "out") {
    return (
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive text-white">
        <X className="size-3.5" strokeWidth={3} />
      </span>
    );
  }
  return <span aria-hidden="true" className="size-7 shrink-0 rounded-full border-2 border-dashed border-muted-foreground/50" />;
}

export function ReplySheet({
  name,
  initial,
  pending,
  onClose,
  onSave,
}: {
  name: string;
  initial: Answer;
  pending: boolean;
  onClose: () => void;
  onSave: (answer: Answer) => void;
}) {
  const [status, setStatus] = useState<ReplyStatus>(initial.status);
  const [note, setNote] = useState(initial.note);
  const [reason, setReason] = useState(initial.reason);
  const you = name === "You";

  return (
    <BottomSheet
      eyebrow={you ? "Your reply" : "Reply for"}
      title={you ? null : name}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ status, note, reason });
      }}
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label={you ? "Can you make it?" : `Can ${name} make it?`} className="grid grid-cols-2 gap-2">
          {(
            [
              ["available", you ? "I'm in" : "In"],
              ["not_available", you ? "I'm out" : "Out"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={status === value}
              onClick={() => setStatus(value)}
              className={cn(
                "h-11 rounded-2xl text-sm font-semibold",
                status === value
                  ? value === "available"
                    ? "bg-primary text-primary-foreground"
                    : "bg-destructive text-white"
                  : "border border-border",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {status === "available" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reply-note">Anything to add? (optional)</Label>
            <Input id="reply-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. running late" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reply-reason">Why not?</Label>
            <Textarea
              id="reply-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. exams, injured, away"
            />
            <p className="text-xs text-muted-foreground">Only committee{you ? " and you" : ` and ${name}`} can see this.</p>
          </div>
        )}

        <SheetSaveButton pending={pending} />
      </div>
    </BottomSheet>
  );
}

function AnnounceSheet({
  count,
  pending,
  onClose,
  onSend,
}: {
  count: number;
  pending: boolean;
  onClose: () => void;
  onSend: (replyBy: { date: string; time: string } | null) => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("18:00");

  return (
    <BottomSheet
      eyebrow="Announce"
      title="Ask everyone who hasn't replied"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        onSend(date ? { date, time: time || "23:59" } : null);
      }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          We&apos;ll email {people(count)} a link to this page. You can only announce once, then use Nudge to remind people.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reply-by-date">Reply by (optional)</Label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input id="reply-by-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input aria-label="Reply by time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
          </div>
          <p className="text-xs text-muted-foreground">Anyone who replies after this shows as late. Nobody is stopped from replying.</p>
        </div>
        <SendButton pending={pending} disabled={count === 0}>
          Email {people(count)}
        </SendButton>
      </div>
    </BottomSheet>
  );
}

function NudgeSheet({
  rows,
  now,
  pending,
  onClose,
  onSend,
}: {
  rows: AvailabilityRow[];
  now: Date;
  pending: boolean;
  onClose: () => void;
  onSend: (playerIds: string[]) => void;
}) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(rows.map((r) => r.userId)));
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <BottomSheet
      eyebrow="Nudge"
      title="Remind people who haven't replied"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        onSend([...chosen]);
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-muted-foreground">{chosen.size} of {rows.length} ticked</span>
          <button
            type="button"
            className="font-medium underline-offset-4 hover:underline"
            onClick={() => setChosen(chosen.size === rows.length ? new Set() : new Set(rows.map((r) => r.userId)))}
          >
            {chosen.size === rows.length ? "Untick all" : "Tick all"}
          </button>
        </div>
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={row.userId}>
              <label className="flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-muted">
                <input
                  type="checkbox"
                  checked={chosen.has(row.userId)}
                  onChange={() => toggle(row.userId)}
                  className="size-5 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  {row.nudgedAt && <span className="block text-xs text-muted-foreground">nudged {formatAgo(row.nudgedAt, now)}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <SendButton pending={pending} disabled={chosen.size === 0}>
          Nudge {people(chosen.size)}
        </SendButton>
      </div>
    </BottomSheet>
  );
}

function SendButton({ pending, disabled, children }: { pending: boolean; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
