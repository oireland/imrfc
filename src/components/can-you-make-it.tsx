"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import type { ReplyStatus, WaitingAsk } from "@/features/availability";
import { formatWhen } from "@/lib/format-time";
import { ReplySheet } from "./availability-card";
import type { Result } from "@/lib/result";

type Answer = { status: ReplyStatus; note: string; reason: string };

/**
 * Home's "Can you make it?": one card per announced Training or Match day you haven't
 * replied to. "I'm in" saves straight away; "I'm out" asks why first. A card goes once answered.
 */
export function CanYouMakeIt({
  asks,
  now,
  reply,
}: {
  asks: WaitingAsk[];
  now: Date;
  reply: (eventId: string, answer: Answer) => Promise<Result>;
}) {
  const [out, setOut] = useState<WaitingAsk | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);

  function save(eventId: string, answer: Answer, success: string) {
    setSaving(eventId);
    startTransition(async () => {
      const result = await reply(eventId, answer);
      setSaving(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setOut(null);
    });
  }

  if (asks.length === 0) return null;

  return (
    <section aria-labelledby="can-you-make-it" className="flex flex-col gap-3">
      <h2 id="can-you-make-it" className="font-heading text-[28px] leading-none">
        Can you make it?
      </h2>
      <ul className="flex flex-col gap-2.5">
        {asks.map((ask) => {
          const title = ask.events.map((e) => e.title).join(" & ");
          const busy = pending && saving === ask.eventId;
          return (
            <li key={ask.eventId}>
              <article aria-label={title} className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
                <Link href={`/events/${ask.eventId}`} className="flex flex-col gap-1">
                  <span className="font-heading text-[21px] leading-tight">{title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatWhen(ask.events[0].start, now)}
                    {ask.replyBy && ` · reply by ${formatWhen(ask.replyBy, now)}`}
                  </span>
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => save(ask.eventId, { status: "available", note: "", reason: "" }, "You're in")}
                    className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                    I&apos;m in
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setOut(ask)}
                    className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    <X className="size-4" aria-hidden="true" />
                    I&apos;m out
                  </button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {out && (
        <ReplySheet
          key={out.eventId}
          name="You"
          initial={{ status: "not_available", note: "", reason: "" }}
          pending={pending}
          onClose={() => setOut(null)}
          onSave={(answer) => save(out.eventId, answer, answer.status === "available" ? "You're in" : "Got it, you're out")}
        />
      )}
    </section>
  );
}
