"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { EditEventSheet, type EditEventInitial } from "@/components/edit-event-sheet";
import type { QuickEventInput } from "@/features/events";
import type { Result } from "@/lib/result";

type EventType = QuickEventInput["type"];

/** The pencil icon top-right of an Event's detail Card: Committee and above only. */
export function EditEventButton({
  eventType,
  isOccurrence,
  venues,
  teams,
  initial,
  action,
}: {
  eventType: EventType;
  isOccurrence: boolean;
  venues: string[];
  teams: { id: string; name: string }[];
  initial: EditEventInitial;
  action: (input: QuickEventInput & { scope: "this" | "future" }) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit event"
        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <EditEventSheet
          eventType={eventType}
          isOccurrence={isOccurrence}
          venues={venues}
          teams={teams}
          initial={initial}
          action={action}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
