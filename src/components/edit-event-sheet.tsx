"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { BottomSheet, SheetSaveButton } from "@/components/bottom-sheet";
import { MatchWhen, MatchWho, matchInput, type EventType, type HomeAway, type Competition, type MatchFieldValues } from "@/components/event-fields";
import { VenueInput } from "@/components/venue-input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "cn";
import type { QuickEventInput } from "@/features/events";

const TYPE_LABEL: Record<EventType, string> = { training: "Training", match: "Match", social: "Social" };

// Free text for the Team Sheet, kept on the Match.
const SHEET_TEXT = [
  ["schedule", "Schedule", "changing rooms 10.15am, warm up 10.30am"],
  ["travelAttire", "Travel attire", ""],
  ["warmUpAttire", "Warm up attire", ""],
  ["postMatchActivity", "Post match", ""],
] as const;

export type EditEventInitial = {
  date: string; // YYYY-MM-DD, London
  startTime: string; // HH:MM, London; a Match's kick-off, empty while TBC
  endTime: string;
  title: string; // Social only
  venue: string;
  notes: string;
  teamId?: string;
  opponent?: string;
  homeAway?: HomeAway;
  competition?: Competition;
  meetTime?: string; // empty while TBC
  travelMeetTime?: string; // empty while TBC
  travelMeetPoint?: string;
  schedule?: string;
  travelAttire?: string;
  warmUpAttire?: string;
  postMatchActivity?: string;
};

/**
 * "Edit event" sheet, opened from the pencil icon on an Event's detail page. Committee and
 * above only. The type is fixed once an Event exists. For an Occurrence, the date stays fixed
 * and it offers "this one" or "this and future".
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
  const [scope, setScope] = useState<"this" | "future">("this");
  const [moreOpen, setMoreOpen] = useState(false);
  const [match, setMatch] = useState<MatchFieldValues>({
    teamId: initial.teamId ?? "",
    opponent: initial.opponent ?? "",
    homeAway: initial.homeAway ?? "home",
    kickoff: initial.startTime,
    meetTime: initial.meetTime ?? "",
    travelMeetTime: initial.travelMeetTime ?? "",
    travelMeetPoint: initial.travelMeetPoint ?? "",
    competition: initial.competition ?? "friendly",
  });
  const patchMatch = (patch: Partial<MatchFieldValues>) => setMatch((m) => ({ ...m, ...patch }));
  const [sheetText, setSheetText] = useState({
    schedule: initial.schedule ?? "",
    travelAttire: initial.travelAttire ?? "",
    warmUpAttire: initial.warmUpAttire ?? "",
    postMatchActivity: initial.postMatchActivity ?? "",
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await action({
        date,
        type: eventType,
        venue,
        notes,
        scope,
        ...(eventType === "match"
          ? { ...matchInput(match), ...sheetText }
          : { startTime: start, endTime: end, ...(eventType === "social" ? { title } : {}) }),
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
      <p className="mb-4 text-sm font-medium text-muted-foreground">{TYPE_LABEL[eventType]}</p>

      {eventType === "social" && (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add title"
          aria-label="Title"
          required
          className="mb-4 w-full border-b border-border bg-transparent pb-2 text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
        />
      )}

      {eventType === "match" && <MatchWho values={match} teams={teams} onChange={patchMatch} />}

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

      {eventType !== "match" && (
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
      )}

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

      {eventType === "match" && <MatchWhen values={match} onChange={patchMatch} />}

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
          {eventType === "match" &&
            SHEET_TEXT.map(([field, label, hint]) => (
              <input
                key={field}
                value={sheetText[field]}
                onChange={(e) => setSheetText((t) => ({ ...t, [field]: e.target.value }))}
                placeholder={hint ? `${label}, e.g. ${hint}` : label}
                aria-label={label}
                className="rounded-xl bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            ))}
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
