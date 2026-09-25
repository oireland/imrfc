"use client";

import { useState } from "react";
import Link from "next/link";
import { Beer, ChevronLeft, ChevronRight, Dumbbell, MapPin, Plus, Trophy } from "lucide-react";
import { cn } from "cn";
import type { QuickEventInput } from "@/features/events";
import { londonDay, londonTime, monthGrid } from "@/lib/calendar";
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
};

const TYPE: Record<CalendarEventType, { label: string; icon: typeof Dumbbell; className: string }> = {
  training: { label: "Training", icon: Dumbbell, className: "bg-training text-training-foreground" },
  match: { label: "Match", icon: Trophy, className: "bg-match text-match-foreground" },
  social: { label: "Social", icon: Beer, className: "bg-social text-social-foreground italic" },
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const longDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${ymd}T12:00:00Z`));
const monthLabel = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)));

/**
 * "What's coming up": a month Calendar (every Event readable in its day, tap a day to
 * add one) and an Agenda list, as two tabs.
 */
export function ComingUp({
  events,
  today,
  now,
  canAdd,
  venues,
  teams,
  addAction,
  title = "What's coming up",
}: {
  events: CalendarEvent[];
  today: string; // YYYY-MM-DD, London
  now: number; // for Upcoming vs Past, fixed on the server
  canAdd: boolean;
  venues: string[];
  teams: { id: string; name: string }[];
  addAction: (input: QuickEventInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  title?: string;
}) {
  const [tab, setTab] = useState<"calendar" | "agenda">("calendar");
  const [adding, setAdding] = useState<string | null>(null);

  return (
    <section aria-labelledby="coming-up" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="coming-up" className="font-heading text-[28px] leading-none">
          {title}
        </h2>
        <div role="tablist" aria-label="View" className="flex shrink-0 rounded-full bg-muted p-1 text-[13px] font-semibold">
          {(["calendar", "agenda"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
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

      {tab === "calendar" ? (
        <MonthCalendar events={events} today={today} canAdd={canAdd} onAdd={setAdding} />
      ) : (
        <Agenda events={events} now={now} />
      )}

      {adding && <QuickAddSheet date={adding} venues={venues} teams={teams} action={addAction} onClose={() => setAdding(null)} />}
    </section>
  );
}

function MonthCalendar({
  events,
  today,
  canAdd,
  onAdd,
}: {
  events: CalendarEvent[];
  today: string;
  canAdd: boolean;
  onAdd: (ymd: string) => void;
}) {
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
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
    if (canAdd && (ymd === selected || !byDay.has(ymd))) onAdd(ymd);
    setSelected(ymd);
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

      <div className="mx-5 mt-4 border-t border-border pt-4 pb-5">
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Agenda({ events, now }: { events: CalendarEvent[]; now: number }) {
  const upcoming = events.filter((e) => Date.parse(e.end) > now).slice(0, 15);
  if (upcoming.length === 0) {
    return <p className="rounded-3xl bg-card px-5 py-6 text-sm text-muted-foreground shadow-card">Nothing coming up.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border rounded-3xl bg-card px-5 shadow-card">
      {upcoming.map((e) => {
        const T = TYPE[e.type];
        const start = new Date(e.start);
        return (
          <li key={e.id}>
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
          </li>
        );
      })}
    </ul>
  );
}
