"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { BottomSheet, SheetSaveButton } from "@/components/bottom-sheet";
import { VenueInput } from "@/components/venue-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "cn";
import type { QuickEventInput } from "@/features/events";

type EventType = QuickEventInput["type"];
type HomeAway = NonNullable<QuickEventInput["homeAway"]>;
type Competition = NonNullable<QuickEventInput["competition"]>;

const COMPETITIONS: { key: Competition; label: string }[] = [
  { key: "bucs", label: "BUCS" },
  { key: "lusl", label: "LUSL" },
  { key: "friendly", label: "Friendly" },
  { key: "other", label: "Other" },
];

const TYPE_LABEL: Record<EventType, string> = { training: "Training", match: "Match", social: "Social" };

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

export type EditEventInitial = {
  date: string; // YYYY-MM-DD, London
  startTime: string; // HH:MM, London
  endTime: string;
  title: string;
  venue: string;
  notes: string;
  teamIds: string[];
  opponent?: string;
  homeAway?: HomeAway;
  competition?: Competition;
  meetTime?: string;
  travelMeetTime?: string;
  travelMeetPoint?: string;
};

/**
 * "Edit event" sheet, opened from the pencil icon on an Event's detail page. Committee and
 * above only. For an Occurrence, the date stays fixed and offers "this one" or "this and future".
 */
export function EditEventSheet({
  eventType,
  isOccurrence,
  venues,
  teams,
  initial,
  onClose,
  action,
}: {
  eventType: EventType;
  isOccurrence: boolean;
  venues: string[];
  teams: { id: string; name: string }[];
  initial: EditEventInitial;
  onClose: () => void;
  action: (input: QuickEventInput & { scope: "this" | "future" }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.startTime);
  const [end, setEnd] = useState(initial.endTime);
  const [venue, setVenue] = useState(initial.venue);
  const [notes, setNotes] = useState(initial.notes);
  const [teamIds, setTeamIds] = useState<string[]>(initial.teamIds);
  const [scope, setScope] = useState<"this" | "future">("this");
  const [moreOpen, setMoreOpen] = useState(false);
  const [meetTime, setMeetTime] = useState(initial.meetTime ?? "");
  const [travelMeetTime, setTravelMeetTime] = useState(initial.travelMeetTime ?? "");
  const [travelMeetPoint, setTravelMeetPoint] = useState(initial.travelMeetPoint ?? "");
  const [opponent, setOpponent] = useState(initial.opponent ?? "");
  const [homeAway, setHomeAway] = useState<HomeAway>(initial.homeAway ?? "home");
  const [competition, setCompetition] = useState<Competition>(initial.competition ?? "friendly");

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await action({
        date,
        startTime: start,
        endTime: end,
        type: eventType,
        title,
        venue,
        notes,
        teamIds,
        scope,
        ...(eventType === "match"
          ? { opponent, homeAway, competition, meetTime: meetTime || undefined, travelMeetTime: travelMeetTime || undefined, travelMeetPoint }
          : {}),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Event updated");
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet eyebrow="Edit event" onSubmit={save} onClose={onClose}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={eventType === "match" ? "Title (defaults to vs Opponent)" : "Add title"}
        aria-label="Title"
        className="mb-4 w-full border-b border-border bg-transparent pb-2 text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
      />

      <p className="mb-4 text-sm text-muted-foreground capitalize">{TYPE_LABEL[eventType]}</p>

      {eventType === "match" && (
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

      {!isOccurrence && (
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
        id="edit-event-venue"
        aria-label="Venue"
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        onFocus={(e) => e.target.select()}
        suggestions={venues}
        required
        className="mb-3 h-10 w-full rounded-xl"
      />

      {isOccurrence && (
        <div className="mb-3 flex flex-col gap-1">
          <label htmlFor="edit-event-scope" className="text-sm text-muted-foreground">
            Applies to
          </label>
          <NativeSelect id="edit-event-scope" value={scope} onChange={(e) => setScope(e.target.value as "this" | "future")}>
            <NativeSelectOption value="this">This one</NativeSelectOption>
            <NativeSelectOption value="future">This and future</NativeSelectOption>
          </NativeSelect>
        </div>
      )}

      <button
        type="button"
        onClick={() => setMoreOpen((o) => !o)}
        aria-expanded={moreOpen}
        aria-controls="edit-event-more"
        className="mb-5 flex items-center gap-1 text-sm text-muted-foreground"
      >
        More options
        <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden="true" />
      </button>

      {moreOpen && (
        <div id="edit-event-more" className="mb-5 flex flex-col gap-4">
          {eventType === "match" && (
            <>
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
              <label className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Travel meet time</span>
                <input
                  type="time"
                  value={travelMeetTime}
                  onChange={(e) => setTravelMeetTime(e.target.value)}
                  aria-label="Travel meet time"
                  className="rounded-xl bg-muted px-3 py-2 tabular-nums"
                />
              </label>
              <input
                value={travelMeetPoint}
                onChange={(e) => setTravelMeetPoint(e.target.value)}
                placeholder="Travel meet point"
                aria-label="Travel meet point"
                className="rounded-xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </>
          )}
          {!isOccurrence && teams.length > 0 && (
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
          )}
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

      <SheetSaveButton pending={pending} />
    </BottomSheet>
  );
}
