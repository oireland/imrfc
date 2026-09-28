"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Beer, Check, ChevronLeft, ChevronRight, Dumbbell, Loader2, MapPin, Plus, Trophy, X } from "lucide-react";
import { cn } from "cn";
import type { MyReply, ReplyStatus } from "@/features/availability";
import type { QuickEventInput } from "@/features/events";
import { londonDay, londonTime, monthGrid } from "@/lib/calendar";
import { comingUpSearch, readComingUpView, type ComingUpView } from "@/lib/coming-up-view";
import { ReplySheet } from "@/components/availability-card";
import { QuickAddSheet } from "@/components/quick-add-sheet";

export type CalendarEventType = "training" | "match" | "social";

/** An Event as the calendar needs it; plain data so it can cross to the client. */
export type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  start: string; // ISO
  end: string; // ISO
  venue: string;
  cancelled: boolean;
  /** The signed-in User has a Duty on it. */
  mine: boolean;
  /** The signed-in User's own reply, for Training and Matches; null otherwise. */
  reply: MyReply | null;
};

type Answer = { status: ReplyStatus; note: string; reason: string };
type ReplyAction = (eventId: string, answer: Answer) => Promise<{ ok: true } | { ok: false; error: string }>;

const TYPE: Record<CalendarEventType, { label: string; plural: string; icon: typeof Dumbbell; className: string }> = {
  training: { label: "Training", plural: "Training", icon: Dumbbell, className: "bg-training text-training-foreground" },
  match: { label: "Match", plural: "Matches", icon: Trophy, className: "bg-match text-match-foreground" },
  social: { label: "Social", plural: "Socials", icon: Beer, className: "bg-social text-social-foreground italic" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const longDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)));

/**
 * "What's coming up": a month Calendar (every Event readable in its day, tap a day to
 * add one) and an Agenda list (reply to Training and Matches in place), as two tabs.
 * The tab and any Event Type filter live in the URL, so either can be bookmarked.
 */
export function ComingUp({
  events,
  today,
  now,
  canAdd,
  venues,
  teams,
  addAction,
  reply,
  title = "What's coming up",
  seeAllHref,
}: {
  events: CalendarEvent[];
  today: string; // YYYY-MM-DD, London
  now: number; // for Upcoming vs Past, fixed on the server
  canAdd: boolean;
  venues: string[];
  teams: { id: string; name: string }[];
  addAction: (input: QuickEventInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  title?: string;
  reply: ReplyAction;
  /** Home only: the title links across to Events. */
  seeAllHref?: string;
}) {
  const searchParams = useSearchParams();
  const { view: tab, type } = readComingUpView(searchParams);
  const [adding, setAdding] = useState<string | null>(null);
  const shown = type ? events.filter((e) => e.type === type) : events;

  function show(next: ComingUpView) {
    // Replace rather than push, so Back leaves the page instead of stepping through tabs.
    window.history.replaceState(null, "", `${window.location.pathname}${comingUpSearch(searchParams, next)}`);
  }

  return (
    <section aria-labelledby="coming-up" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="coming-up" className="min-w-0 font-heading text-[28px] leading-none">
          {seeAllHref ? (
            <Link href={seeAllHref} className="inline-flex items-center gap-1 hover:text-muted-foreground">
              {title}
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ) : (
            title
          )}
        </h2>
        <div role="tablist" aria-label="View" className="flex shrink-0 rounded-full bg-muted p-1 text-[13px] font-semibold">
          {(["calendar", "agenda"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => show({ view: t, type })}
              className={cn(
                "rounded-full px-3 py-1.5 capitalize transition-colors",
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <TypeFilter type={type} onChange={(t) => show({ view: tab, type: t })} />

      {tab === "calendar" ? (
        <MonthCalendar events={shown} today={today} canAdd={canAdd} onAdd={setAdding} reply={reply} />
      ) : (
        <Agenda events={shown} now={now} type={type} reply={reply} />
      )}

      {adding && <QuickAddSheet date={adding} venues={venues} teams={teams} action={addAction} onClose={() => setAdding(null)} />}
    </section>
  );
}

function TypeFilter({ type, onChange }: { type: CalendarEventType | null; onChange: (type: CalendarEventType | null) => void }) {
  const options = [null, "training", "match", "social"] as const;
  return (
    <div role="radiogroup" aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4 text-[13px] font-semibold [scrollbar-width:none]">
      {options.map((t) => {
        const Icon = t && TYPE[t].icon;
        const selected = type === t;
        return (
          <button
            key={t ?? "all"}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 transition-colors",
              !selected ? "bg-muted text-muted-foreground" : t ? cn(TYPE[t].className, "not-italic") : "bg-foreground text-background",
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden="true" />}
            {t ? TYPE[t].plural : "All"}
          </button>
        );
      })}
    </div>
  );
}

function MonthCalendar({
  events,
  today,
  canAdd,
  onAdd,
  reply,
}: {
  events: CalendarEvent[];
  today: string;
  canAdd: boolean;
  onAdd: (ymd: string) => void;
  reply: ReplyAction;
}) {
  const replies = useQuickReply(reply);
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const selectedDayRef = useRef<HTMLDivElement>(null);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const day = londonDay(new Date(e.start));
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const days = monthGrid(view.year, view.month);
  const selectedEvents = byDay.get(selected) ?? [];

  function shift(delta: number) {
    const d = new Date(Date.UTC(view.year, view.month + delta, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  }

  function tapDay(ymd: string) {
    const hasEvents = byDay.has(ymd);
    if (canAdd && (ymd === selected || !hasEvents)) onAdd(ymd);
    setSelected(ymd);
    if (hasEvents) {
      const el = selectedDayRef.current;
      if (el) {
        // Clear the fixed bottom tab bar, not just the viewport edge.
        const bottomBarClearance = 96;
        const distance = el.getBoundingClientRect().bottom - window.innerHeight + bottomBarClearance;
        if (distance > 0) window.scrollBy({ top: distance, behavior: "smooth" });
      }
    }
  }

  return (
    <div className="-mx-2 flex flex-col overflow-hidden rounded-3xl bg-card shadow-card">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <p className="font-heading text-[26px] leading-none" aria-live="polite">
          {monthLabel(view.year, view.month)} <span className="text-muted-foreground">{view.year}</span>
        </p>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="rounded-full p-2 hover:bg-muted">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="rounded-full p-2 hover:bg-muted">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-border">
        {WEEKDAYS.map((d) => (
          <span key={d} className="border-b border-border py-1.5 text-center text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {d}
          </span>
        ))}
        {days.map((ymd, i) => {
          const dayEvents = byDay.get(ymd) ?? [];
          const inMonth = Number(ymd.slice(5, 7)) - 1 === view.month;
          const label = `${longDate(ymd)}${dayEvents.length ? `: ${dayEvents.map((e) => e.title).join(", ")}` : ""}`;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => tapDay(ymd)}
              aria-label={label}
              aria-pressed={ymd === selected}
              className={cn(
                "flex min-h-[92px] min-w-0 flex-col gap-[3px] border-b border-border p-[2px] text-left transition-colors",
                i % 7 !== 6 && "border-r",
                ymd === selected ? "bg-muted" : !inMonth && "bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "mr-0.5 flex size-5 items-center justify-center self-end rounded-full text-[11px] tabular-nums",
                  ymd === today
                    ? "bg-foreground font-semibold text-background"
                    : inMonth
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {Number(ymd.slice(8))}
              </span>
              {dayEvents.slice(0, 2).map((e) => (
                <span
                  key={e.id}
                  className={cn(
                    "flex min-w-0 flex-col rounded-[6px] px-[3px] py-[3px] leading-[1.12]",
                    // Cancelled: dashed and muted rather than faded, so the text keeps its contrast.
                    e.cancelled ? "border border-dashed border-border text-muted-foreground line-through" : TYPE[e.type].className,
                    e.mine && "shadow-[inset_3px_0_0_var(--gold)]",
                  )}
                >
                  <span className="line-clamp-3 text-[10px] font-semibold tracking-[-0.01em] hyphens-auto [overflow-wrap:anywhere]">
                    {e.title}
                  </span>
                  <span className="text-[9px] font-normal tabular-nums not-italic">{londonTime(new Date(e.start))}</span>
                </span>
              ))}
              {dayEvents.length > 2 && <span className="px-0.5 text-[9px] font-medium text-muted-foreground">+{dayEvents.length - 2} more</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-3 text-[11px] text-muted-foreground">
        {(["training", "match", "social"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", TYPE[t].className)} />
            {TYPE[t].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" /> Your Duty
        </span>
      </div>

      <div ref={selectedDayRef} className="mx-5 mt-4 border-t border-border pt-4 pb-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">{selected === today ? "Today" : longDate(selected)}</p>
          {canAdd && (
            <button
              type="button"
              onClick={() => onAdd(selected)}
              className="flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add
            </button>
          )}
        </div>
        {selectedEvents.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nothing on.{canAdd && " Tap the day again or press Add."}
          </p>
        ) : (
          <ul className="flex flex-col">
            {selectedEvents.map((e) => (
              <li key={e.id}>
                <Link href={`/events/${e.id}`} className="flex items-center gap-3 rounded-xl py-2 hover:bg-muted/60">
                  <span className={cn("h-9 w-1 shrink-0 rounded-full", TYPE[e.type].className)} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate font-medium", e.cancelled && "line-through")}>{e.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {londonTime(new Date(e.start))}–{londonTime(new Date(e.end))} · {e.venue}
                    </span>
                  </span>
                  {e.mine && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">Your Duty</span>}
                  {e.cancelled && <span className="shrink-0 text-xs font-semibold text-destructive-text">Cancelled</span>}
                </Link>
                {isReplyable(e) && (
                  // Lines up under the title: colour bar (w-1) + gap.
                  <div className="ml-4 pb-2">
                    <QuickReply event={e} replies={replies} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {replies.sheet}
    </div>
  );
}

/** Whether you can reply to an Event in place: Training or a Match, not Cancelled, and open (or already answered). */
function isReplyable(e: CalendarEvent): e is CalendarEvent & { reply: MyReply } {
  return !!e.reply && !e.cancelled && (!!e.reply.status || e.reply.open);
}

/** Saving your reply in place: I'm in saves straight away; I'm out and Change open the reply sheet. */
function useQuickReply(reply: ReplyAction) {
  const [out, setOut] = useState<{ event: CalendarEvent; initial: Answer } | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);

  function save(eventId: string, answer: Answer) {
    setSaving(eventId);
    startTransition(async () => {
      const result = await reply(eventId, answer);
      setSaving(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(answer.status === "available" ? "You're in" : "Got it, you're out");
      setOut(null);
    });
  }

  const sheet = out && (
    <ReplySheet
      key={out.event.id}
      name="You"
      initial={out.initial}
      pending={pending}
      onClose={() => setOut(null)}
      onSave={(answer) => save(out.event.id, answer)}
    />
  );

  return { save, setOut, pending, saving, sheet };
}

function QuickReply({ event: e, replies }: { event: CalendarEvent & { reply: MyReply }; replies: ReturnType<typeof useQuickReply> }) {
  return (
    <AgendaReply
      reply={e.reply}
      busy={replies.pending && replies.saving === e.id}
      disabled={replies.pending}
      onIn={() => replies.save(e.id, { status: "available", note: "", reason: "" })}
      onOut={() => replies.setOut({ event: e, initial: { status: "not_available", note: "", reason: "" } })}
      onChange={() => replies.setOut({ event: e, initial: { status: e.reply.status ?? "available", note: "", reason: "" } })}
    />
  );
}

function Agenda({
  events,
  now,
  type,
  reply,
}: {
  events: CalendarEvent[];
  now: number;
  /** The Event Type filtered to, for the empty message. */
  type: CalendarEventType | null;
  reply: ReplyAction;
}) {
  const replies = useQuickReply(reply);

  const upcoming = events.filter((e) => Date.parse(e.end) > now);
  if (upcoming.length === 0) {
    return (
      <p className="rounded-3xl bg-card px-5 py-6 text-sm text-muted-foreground shadow-card">
        {type ? `No ${TYPE[type].plural.toLowerCase()} coming up.` : "Nothing coming up."}
      </p>
    );
  }
  return (
    <>
      <ul className="flex flex-col divide-y divide-border rounded-3xl bg-card px-5 shadow-card">
        {upcoming.map((e) => {
          const T = TYPE[e.type];
          const start = new Date(e.start);
          const replyable = isReplyable(e);
          return (
            <li key={e.id} className={cn(replyable && "pb-4")}>
              <Link href={`/events/${e.id}`} className="flex items-center gap-4 py-4">
                <span className="w-10 shrink-0 text-center">
                  <span className="block font-heading text-[30px] leading-none">
                    {new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Europe/London" }).format(start)}
                  </span>
                  <span className="block text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    {new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Europe/London" }).format(start)}
                  </span>
                </span>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full not-italic", T.className)}>
                  <T.icon className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{T.label}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", e.cancelled && "line-through")}>{e.title}</span>
                  <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "Europe/London" }).format(start)} {londonTime(start)} ·{" "}
                    <MapPin className="size-3 shrink-0" aria-hidden="true" /> {e.venue}
                  </span>
                </span>
                {e.cancelled ? (
                  <span className="shrink-0 text-xs font-semibold text-destructive-text">Cancelled</span>
                ) : (
                  e.mine && (
                    <span className="size-2.5 shrink-0 rounded-full bg-accent">
                      <span className="sr-only">Your Duty</span>
                    </span>
                  )
                )}
              </Link>
              {replyable && (
                // Lines up under the title: date (w-10) + gap + type icon (size-8) + gap.
                <div className="-mt-1 ml-[104px]">
                  <QuickReply event={e} replies={replies} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {replies.sheet}
    </>
  );
}

/** Your reply to one Event: I'm in / I'm out until you've replied, then your answer (tap to change while it's open). */
function AgendaReply({
  reply,
  busy,
  disabled,
  onIn,
  onOut,
  onChange,
}: {
  reply: MyReply;
  busy: boolean;
  disabled: boolean;
  onIn: () => void;
  onOut: () => void;
  onChange: () => void;
}) {
  if (reply.status) {
    const isIn = reply.status === "available";
    const answer = (
      <>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full",
            isIn ? "bg-primary text-primary-foreground" : "bg-destructive text-white",
          )}
        >
          {isIn ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
        </span>
        {isIn ? "You're in" : "You're out"}
      </>
    );
    return reply.open ? (
      <button
        type="button"
        disabled={disabled}
        onClick={onChange}
        className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-[13px] font-semibold hover:bg-muted disabled:opacity-60"
      >
        {answer}
        <span className="font-normal text-muted-foreground">· Change</span>
      </button>
    ) : (
      <span className="flex items-center gap-2 py-1 pl-1 text-[13px] font-semibold">{answer}</span>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onIn}
        className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
        I&apos;m in
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onOut}
        className="flex h-8 items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-60"
      >
        <X className="size-3.5" aria-hidden="true" />
        I&apos;m out
      </button>
    </div>
  );
}
