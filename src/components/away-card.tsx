"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BottomSheet, SheetSaveButton } from "@/components/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: true } | { ok: false; error: string };

export type AwayItem = {
  id: string;
  from: string;
  until: string;
  /** "20 Dec – 5 Jan". */
  range: string;
  reason: string;
  /** "set by Tom" when someone else added it, else null. */
  setBy: string | null;
};

export type AwayCardActions = {
  add: (input: { from: string; until: string; reason: string }) => Promise<Result>;
  edit: (id: string, input: { from: string; until: string; reason: string }) => Promise<Result>;
  imBack: (id: string) => Promise<Result>;
  remove: (id: string) => Promise<Result>;
};

/**
 * A Player's time Away: current and coming periods with Edit / I'm back / Remove, past ones as
 * history, and an Add button. On Profile for the Player and on the Player page for Committee.
 */
export function AwayCard({
  title,
  current,
  future,
  past,
  today,
  actions,
  addLabel = "Add time away",
  emptyText,
}: {
  title: string;
  current: AwayItem[];
  future: AwayItem[];
  past: AwayItem[];
  today: string;
  actions: AwayCardActions;
  addLabel?: string;
  emptyText: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [sheet, setSheet] = useState<{ editing: AwayItem | null } | null>(null);

  function run(task: () => Promise<Result>, done: string) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(done, { id: "away-saved" });
      router.refresh();
    });
  }

  const running = [...current.map((a) => ({ ...a, state: "current" as const })), ...future.map((a) => ({ ...a, state: "future" as const }))];

  return (
    <Card>
      <CardHeader>
        <h3 className="font-heading text-[22px] leading-tight">{title}</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {running.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
        <ul className="flex flex-col gap-3">
          {running.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-2xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{a.range}</p>
                  <p className="text-sm break-words text-muted-foreground">
                    {a.reason}
                    {a.setBy && ` · ${a.setBy}`}
                  </p>
                </div>
                <Badge variant="secondary">{a.state === "current" ? "Away now" : "Coming up"}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.state === "current" && (
                  <Button size="sm" onClick={() => run(() => actions.imBack(a.id), "Welcome back")}>
                    I&apos;m back
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setSheet({ editing: a })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => actions.remove(a.id), "Removed")}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <Button variant="outline" className="self-start" onClick={() => setSheet({ editing: null })}>
          {addLabel}
        </Button>

        {past.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">Past</p>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {past.map((a) => (
                <li key={a.id}>
                  Away {a.range}, {a.reason}
                  {a.setBy && ` (${a.setBy})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {sheet && (
        <AwaySheet
          editing={sheet.editing}
          today={today}
          onClose={() => setSheet(null)}
          save={(input) => (sheet.editing ? actions.edit(sheet.editing.id, input) : actions.add(input))}
          onSaved={() => {
            setSheet(null);
            toast.success(sheet.editing ? "Saved" : "Added", { id: "away-saved" });
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function AwaySheet({
  editing,
  today,
  save,
  onSaved,
  onClose,
}: {
  editing: AwayItem | null;
  today: string;
  save: (input: { from: string; until: string; reason: string }) => Promise<Result>;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(editing?.from ?? today);
  const [until, setUntil] = useState(editing?.until ?? "");
  const [reason, setReason] = useState(editing?.reason ?? "");

  return (
    <BottomSheet
      eyebrow={editing ? "Change time away" : "Time away"}
      title="When won't you be playing?"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await save({ from, until, reason });
          if (result.ok) onSaved();
          else toast.error(result.error);
        });
      }}
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="away-from">From</Label>
            <Input id="away-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="away-until">Until</Label>
            <Input id="away-until" type="date" value={until} min={from} onChange={(e) => setUntil(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="away-reason">Why?</Label>
          <Input id="away-reason" value={reason} placeholder="Exams, a holiday…" onChange={(e) => setReason(e.target.value)} />
        </div>
        <SheetSaveButton pending={pending} />
      </div>
    </BottomSheet>
  );
}
