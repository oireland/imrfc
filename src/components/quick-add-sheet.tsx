"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { BottomSheet, SheetSaveButton } from "@/components/bottom-sheet";
import { Chip, MatchWhen, MatchWho, matchInput, type EventType, type MatchFieldValues } from "@/components/event-fields";
import { VenueInput } from "@/components/venue-input";
import { cn } from "cn";
import type { QuickEventInput } from "@/features/events";

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

const NEW_MATCH: MatchFieldValues = {
  teamId: "",
  opponent: "",
  homeAway: "home",
  kickoff: "",
  meetTime: "",
  travelMeetTime: "",
  travelMeetPoint: "",
  competition: "bucs",
};

/**
 * "New event" sheet, like Google Calendar. Committee and above only. Give it a date (the
 * calendar's selected day) or leave it out and it asks for one. The type comes first, since it
 * decides the rest: Training is "Training @ Venue" for everyone, a Match is a Team against an
 * opponent, and only a Social is titled by hand.
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
  const [repeatUntil, setRepeatUntil] = useState("");
  const [venue, setVenue] = useState(venues[0] ?? "");
  const [match, setMatch] = useState<MatchFieldValues>(NEW_MATCH);
  const patchMatch = (patch: Partial<MatchFieldValues>) => setMatch((m) => ({ ...m, ...patch }));
  const repeats = type !== "match" && !!repeatUntil;
  const dateLabel = fixedDate
    ? new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
        new Date(`${fixedDate}T12:00:00Z`),
      )
    : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (type === "match" && !match.teamId) {
      toast.error("Which team is playing? Pick a team.");
      return;
    }
    startTransition(async () => {
      const result = await action({
        date,
        type,
        venue,
        notes,
        ...(type === "match"
          ? matchInput(match)
          : { startTime: start, endTime: end, ...(type === "social" ? { title } : {}), ...(repeats ? { repeatUntil } : {}) }),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(repeats ? "Weekly event created" : "Event created");
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet eyebrow="New event" title={dateLabel} onSubmit={save} onClose={onClose}>
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

      {type === "social" && (
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

      {type === "match" && <MatchWho values={match} teams={teams} onChange={patchMatch} />}

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

      {type !== "match" && (
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
        id="quick-add-venue"
        aria-label="Venue"
        value={venue}
        onChange={(e) => setVenue(e.target.value)}
        onFocus={(e) => e.target.select()}
        suggestions={venues}
        required
        className="mb-3 h-10 w-full rounded-xl"
      />

      {type === "match" && <MatchWhen values={match} onChange={patchMatch} />}

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
          {type !== "match" && (
            <label className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Repeat weekly until</span>
              <input
                type="date"
                value={repeatUntil}
                min={date || undefined}
                onChange={(e) => setRepeatUntil(e.target.value)}
                aria-label="Repeat weekly until"
                className="rounded-xl bg-muted px-3 py-2 text-sm"
              />
            </label>
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
