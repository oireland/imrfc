"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "cn";
import type { QuickEventInput } from "@/features/events";

type EventType = QuickEventInput["type"];
type HomeAway = NonNullable<QuickEventInput["homeAway"]>;
type Competition = NonNullable<QuickEventInput["competition"]>;

const DEFAULT_TIMES: Record<EventType, [string, string]> = {
  training: ["19:00", "21:00"],
  match: ["14:30", "16:30"],
  social: ["20:00", "23:00"],
};

const COMPETITIONS: { key: Competition; label: string }[] = [
  { key: "bucs", label: "BUCS" },
  { key: "lusl", label: "LUSL" },
  { key: "friendly", label: "Friendly" },
  { key: "other", label: "Other" },
];

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition-colors",
        selected ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70",
      )}
    >
      {children}
    </button>
  );
}

/** Tap-a-day "New event" sheet, like Google Calendar. Committee and above only. */
export function QuickAddSheet({
  date,
  venues,
  onClose,
  action,
}: {
  date: string; // YYYY-MM-DD, London
  venues: { id: string; name: string }[];
  onClose: () => void;
  action: (input: QuickEventInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<EventType>("training");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(DEFAULT_TIMES.training[0]);
  const [end, setEnd] = useState(DEFAULT_TIMES.training[1]);
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");
  const [opponent, setOpponent] = useState("");
  const [homeAway, setHomeAway] = useState<HomeAway>("home");
  const [competition, setCompetition] = useState<Competition>("bucs");
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

  function pickType(t: EventType) {
    setType(t);
    setStart(DEFAULT_TIMES[t][0]);
    setEnd(DEFAULT_TIMES[t][1]);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await action({
        date,
        startTime: start,
        endTime: end,
        type,
        title,
        venueId,
        ...(type === "match" ? { opponent, homeAway, competition } : {}),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Event created");
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="quick-add-title">
      <button type="button" aria-label="Close" className="absolute inset-0 animate-in bg-black/50 backdrop-blur-sm fade-in" onClick={onClose} />
      <form
        onSubmit={save}
        className="relative max-h-[92dvh] w-full max-w-2xl animate-in overflow-y-auto rounded-t-[28px] bg-popover px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] text-popover-foreground shadow-2xl duration-300 slide-in-from-bottom"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">New event</p>
            <p id="quick-add-title" className="text-lg font-semibold">
              {dateLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-muted p-2">
            <X className="size-4" />
          </button>
        </div>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "match" ? "Title (defaults to vs Opponent)" : "Add title"}
          aria-label="Title"
          className="mb-4 w-full border-b border-border bg-transparent pb-2 text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
        />

        <div className="mb-4 flex gap-2" role="group" aria-label="Event Type">
          <Chip selected={type === "training"} onClick={() => pickType("training")}>
            Training
          </Chip>
          <Chip selected={type === "match"} onClick={() => pickType("match")}>
            Match
          </Chip>
          <Chip selected={type === "social"} onClick={() => pickType("social")}>
            Social
          </Chip>
        </div>

        {type === "match" && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-muted/60 p-3">
            <input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Opponent"
              aria-label="Opponent"
              required
              className="rounded-xl bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label="Home or away">
              <Chip selected={homeAway === "home"} onClick={() => setHomeAway("home")}>
                Home
              </Chip>
              <Chip selected={homeAway === "away"} onClick={() => setHomeAway("away")}>
                Away
              </Chip>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Competition">
              {COMPETITIONS.map((c) => (
                <Chip key={c.key} selected={competition === c.key} onClick={() => setCompetition(c.key)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="Start time"
            required
            className="rounded-xl bg-muted px-3 py-2 tabular-nums"
          />
          <span className="text-muted-foreground" aria-hidden="true">
            →
          </span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-label="End time"
            required
            className="rounded-xl bg-muted px-3 py-2 tabular-nums"
          />
        </div>

        <div className="mb-5 flex items-center gap-2">
          <NativeSelect aria-label="Venue" value={venueId} onChange={(e) => setVenueId(e.target.value)} required className="flex-1">
            {venues.length === 0 && <NativeSelectOption value="">No Venues yet</NativeSelectOption>}
            {venues.map((v) => (
              <NativeSelectOption key={v.id} value={v.id}>
                {v.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Link href="/events/new" className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:underline">
            More options
          </Link>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save
        </button>
      </form>
    </div>
  );
}
