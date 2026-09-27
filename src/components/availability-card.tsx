"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "cn";
import type { Availability, AvailabilityRow, ReplyStatus } from "@/features/availability";
import { BottomSheet, SheetSaveButton } from "./bottom-sheet";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

type Answer = { status: ReplyStatus; note: string; reason: string };
type Result = { ok: true } | { ok: false; error: string };
type Tab = "in" | "out" | "none";

/**
 * Who can make a Training or Match: your own reply, the counts, and In / Out / No reply
 * lists. Committee can tap anyone to reply for them.
 */
export function AvailabilityCard({
  availability,
  viewerId,
  playing,
  committee,
  reply,
}: {
  availability: Availability;
  viewerId: string;
  playing: boolean;
  committee: boolean;
  reply: (playerId: string, answer: Answer) => Promise<Result>;
}) {
  const { summary, myReply, open, canReplyForSelf, canReplyForOthers } = availability;
  const [tab, setTab] = useState<Tab>("in");
  const [sheet, setSheet] = useState<{ playerId: string; name: string; initial: Answer } | null>(null);
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
      </div>

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

function PersonRow({ row, tab, you, onTap }: { row: AvailabilityRow; tab: Tab; you: boolean; onTap?: () => void }) {
  const details = [row.note, tab === "out" ? row.reason : null, row.setBy && `set by ${row.setBy}`].filter(Boolean).join(" · ");
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

function ReplySheet({
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
