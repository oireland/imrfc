"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HealthCard } from "@/components/health-stack";
import { UpdateInjurySheet, type InjuryActions, type UpdatableInjury } from "@/components/injury-sheets";
import { StatusPill } from "@/components/injuries-card";

/** Home: one of my open Injuries, "Hamstring — out since 21 Sep · Update", or "Still expecting 12 Oct?" once that has passed. */
export function InjuryHomeCard({
  injury,
  statusLabel,
  summary,
  stillExpecting,
  actions,
}: {
  injury: UpdatableInjury;
  statusLabel: string;
  /** "Since 21 Sep". */
  summary: string;
  /** The passed Expected Return ("12 Oct"), or null. */
  stillExpecting: string | null;
  actions: InjuryActions;
}) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [pending, startTransition] = useTransition();

  // "Not sure yet" is a quick way to answer the prompt without opening the sheet.
  function notSureYet() {
    startTransition(async () => {
      const result = await actions.update(injury.id, {
        status: injury.status,
        expectedReturn: null,
        notSure: true,
        needsPhysio: injury.needsPhysio,
        physioNote: injury.physioNote,
        note: "",
      });
      if (!result.ok) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <HealthCard>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-[22px] leading-tight">{injury.area}</h3>
          <p className="text-sm">{stillExpecting ? `Still expecting ${stillExpecting}?` : summary}</p>
        </div>
        <StatusPill status={injury.status}>{statusLabel}</StatusPill>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setUpdating(true)}
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          Update
        </button>
        {stillExpecting && (
          <button
            type="button"
            disabled={pending}
            onClick={notSureYet}
            className="rounded-full border border-current px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
          >
            Not sure yet
          </button>
        )}
      </div>
      {updating && (
        <UpdateInjurySheet
          injury={injury}
          actions={actions}
          onClose={() => setUpdating(false)}
          onSaved={(message) => {
            setUpdating(false);
            toast.success(message, { id: "injury-saved" });
            router.refresh();
          }}
        />
      )}
    </HealthCard>
  );
}
