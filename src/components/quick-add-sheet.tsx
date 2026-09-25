"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, X } from "lucide-react";
import { VenueInput } from "@/components/venue-input";
import { cn } from "cn";
import type { QuickEventInput } from "@/features/events";

type EventType = QuickEventInput["type"];
type HomeAway = NonNullable<QuickEventInput["homeAway"]>;
type Competition = NonNullable<QuickEventInput["competition"]>;

/** Now and an hour on, as London HH:MM, to prefill the time pickers. */
function nowAndAnHourOn(): [string, string] {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" }).formatToParts(
    new Date(),
  );
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const pad = (h: number) => String(h).padStart(2, "0");
  return [`${pad(hour)}:${minute}`, `${pad((hour + 1) % 24)}:${minute}`];
}

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

/**
 * "New event" sheet, like Google Calendar. Committee and above only. Give it a date (tap-a-day)
 * or leave it out and it asks for one.
 */
export function QuickAddSheet({
  date: fixedDate,
  venues,
  teams,
  onClose,
  action,
}: {
  date?: string; // YYYY-MM-DD, London; omit to let the user choose
  venues: string[]; // already used, as suggestions
  teams: { id: string; name: string }[];
  onClose: () => void;
  action: (input: QuickEventInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<EventType>("training");
  const [chosenDate, setChosenDate] = useState("");
  const date = fixedDate ?? chosenDate;
  const [title, setTitle] = useState("");
  const [[defaultStart, defaultEnd]] = useState(nowAndAnHourOn);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [meetTime, setMeetTime] = useState("");
  const [venue, setVenue] = useState(venues[0] ?? "");
  const [opponent, setOpponent] = useState("");
  const [homeAway, setHomeAway] = useState<HomeAway>("home");
  const [competition, setCompetition] = useState<Competition>("bucs");
  const dateLabel = fixedDate
    ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(`${fixedDate}T12:00:00Z`),
      )
    : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await action({
        date,
        startTime: start,
        endTime: end,
        type,
        title,
        venue,
        notes,
        teamIds,
        ...(type === "match" ? { opponent, homeAway, competition, meetTime: meetTime || undefined } : {}),
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

  const teamsField = teams.length > 0 && (
    <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm text-muted-foreground">Teams (leave blank for the whole club)</legend>
                <div className="flex flex-wrap gap-2">
                  {teams.map((t) => (
                    <Chip
                      key={t.id}
                      selected={teamIds.includes(t.id)}
                      onClick={() => setTeamIds((ids) => (ids.includes(t.id) ? ids.filter((id) => id !== t.id) : [...ids, t.id]))}
                    >
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </fieldset>
  );

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
            <p
              id={dateLabel ? undefined : "quick-add-title"}
              className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
            >
              New event
            </p>
            {dateLabel && (
              <p id="quick-add-title" className="text-lg font-semibold">
                {dateLabel}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full bg-muted p-2">
            <X className="size-4" />
          </button>
        </div>

        <input
          autoFocus={!!fixedDate}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "match" ? "Title (defaults to vs Opponent)" : "Add title"}
          aria-label="Title"
          className="mb-4 w-full border-b border-border bg-transparent pb-2 text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
        />

        <div className="mb-4 flex gap-2" role="group" aria-label="Event Type">
          <Chip selected={type === "training"} onClick={() => setType("training")}>
            Training
          </Chip>
          <Chip selected={type === "match"} onClick={() => setType("match")}>
            Match
          </Chip>
          <Chip selected={type === "social"} onClick={() => setType("social")}>
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
            {teamsField}
          </div>
        )}

        {!fixedDate && (
          <input
            type="date"
            value={chosenDate}
            onChange={(e) => setChosenDate(e.target.value)}
            aria-label="Date"
            required
            className="mb-3 block rounded-xl bg-muted px-3 py-2 text-sm"
          />
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

        <VenueInput
          id="quick-add-venue"
          aria-label="Venue"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          onFocus={(e) => e.target.select()}
          suggestions={venues}
          required
          className="mb-3 h-10 w-full rounded-xl"
        />

        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-controls="quick-add-more"
          className="mb-5 flex items-center gap-1 text-sm text-muted-foreground"
        >
          More options
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden="true" />
        </button>

        {moreOpen && (
          <div id="quick-add-more" className="mb-5 flex flex-col gap-4">
            {type === "match" && (
              <label className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Meet time</span>
                <input
                  type="time"
                  value={meetTime}
                  onChange={(e) => setMeetTime(e.target.value)}
                  aria-label="Meet time"
                  className="rounded-xl bg-muted px-3 py-2 tabular-nums"
                />
              </label>
            )}
            {type !== "match" && teamsField}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              aria-label="Notes"
              rows={3}
              className="rounded-xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        )}

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
