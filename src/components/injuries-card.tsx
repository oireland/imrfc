"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReportInjurySheet, UpdateInjurySheet, type EventOption, type InjuryActions } from "@/components/injury-sheets";
import { cn } from "cn";

export type InjuryCardItem = {
  id: string;
  area: string;
  status: "out" | "training_only" | "playing_through" | "cleared";
  statusLabel: string;
  summary: string;
  /** "Since 21 Sep". */
  since: string;
  expectedReturn: string | null;
  /** The Expected Return has passed. */
  stillExpecting: string | null;
  needsPhysio: boolean;
  physioNote: string;
  checkIn: string | null;
  history: { text: string; note: string; by: string; when: string }[];
};

export const STATUS_PILL: Record<string, string> = {
  out: "bg-out-tint text-destructive-text",
  training_only: "bg-train-tint text-train",
  playing_through: "bg-play-tint text-play",
  cleared: "bg-muted text-muted-foreground",
};

export function StatusPill({ status, children }: { status: string; children: React.ReactNode }) {
  return <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_PILL[status])}>{children}</span>;
}

/**
 * A Player's Injuries: open ones with Update, History and the physio line, a Report button, and
 * Cleared ones as history. On Profile for the Player and on the Player page for Committee.
 */
export function InjuriesCard({
  title,
  open,
  cleared,
  today,
  events,
  actions,
  emptyText,
  showCheckIn = false,
}: {
  title: string;
  open: InjuryCardItem[];
  cleared: InjuryCardItem[];
  today: string;
  events: EventOption[];
  actions: InjuryActions;
  emptyText: string;
  /** Committee only: show the "Due back…, check in" flag. */
  showCheckIn?: boolean;
}) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [updating, setUpdating] = useState<InjuryCardItem | null>(null);
  const done = (message: string) => {
    setReporting(false);
    setUpdating(null);
    toast.success(message, { id: "injury-saved" });
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="font-heading text-[22px] leading-tight">{title}</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {open.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
        <ul className="flex flex-col gap-3">
          {open.map((injury) => (
            <li key={injury.id} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{injury.area}</p>
                <StatusPill status={injury.status}>{injury.statusLabel}</StatusPill>
              </div>
              <p className="text-sm text-muted-foreground">{injury.summary}</p>
              {injury.needsPhysio && (
                <p className="flex items-start gap-1.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>Needs physio{injury.physioNote && `: ${injury.physioNote}`}</span>
                </p>
              )}
              {showCheckIn && injury.checkIn && <p className="text-xs font-semibold text-train">{injury.checkIn}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={() => setUpdating(injury)}>
                  Update
                </Button>
                <History item={injury} />
              </div>
            </li>
          ))}
        </ul>

        <Button variant="outline" className="self-start" onClick={() => setReporting(true)}>
          Report an injury
        </Button>

        {cleared.length > 0 && (
          <details className="flex flex-col gap-1">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Cleared ({cleared.length})</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {cleared.map((injury) => (
                <li key={injury.id} className="flex flex-col gap-1 text-sm">
                  <p>
                    <span className="font-medium">{injury.area}</span> <span className="text-muted-foreground">· {injury.summary}</span>
                  </p>
                  <History item={injury} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>

      {reporting && (
        <ReportInjurySheet today={today} events={events} save={actions.report} onClose={() => setReporting(false)} onSaved={() => done("Injury saved")} />
      )}
      {updating && updating.status !== "cleared" && (
        <UpdateInjurySheet
          injury={{
            id: updating.id,
            area: updating.area,
            since: updating.since,
            status: updating.status,
            expectedReturn: updating.expectedReturn,
            expectedPassed: updating.stillExpecting !== null,
            needsPhysio: updating.needsPhysio,
            physioNote: updating.physioNote,
          }}
          actions={actions}
          onClose={() => setUpdating(null)}
          onSaved={done}
        />
      )}
    </Card>
  );
}

function History({ item }: { item: InjuryCardItem }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold underline underline-offset-3">History</summary>
      <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
        {item.history.map((h, i) => (
          <li key={i}>
            <span className="font-medium text-foreground">{h.text}</span> · {h.by}, {h.when}
            {h.note && <span className="block">&ldquo;{h.note}&rdquo;</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
