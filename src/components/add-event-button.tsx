"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { QuickAddSheet } from "@/components/quick-add-sheet";
import type { QuickEventInput } from "@/features/events";

/** The full-width "+ Add event" button: opens the New event sheet, with a date to choose. */
export function AddEventButton({
  venues,
  teams,
  action,
}: {
  venues: string[];
  teams: { id: string; name: string }[];
  action: (input: QuickEventInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ size: "lg", className: "h-11 w-full" })}>
        <Plus aria-hidden="true" />
        Add event
      </button>
      {open && <QuickAddSheet venues={venues} teams={teams} action={action} onClose={() => setOpen(false)} />}
    </>
  );
}
