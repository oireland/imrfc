"use client";

import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Column = { name: string; required: boolean; description: string; example: string };

/** The "what goes in the file" popup: the header-row rule, every column, and the Team names the file can use. */
export function CsvFormatDialog({
  columns,
  teams,
  maxEvents,
}: {
  columns: readonly Column[];
  teams: string[];
  maxEvents: number;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="lg" className="h-11 w-full" />}>
        <Info aria-hidden="true" />
        What goes in the file
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>What goes in the file</DialogTitle>
          <DialogDescription>One event per row, up to {maxEvents} at a time.</DialogDescription>
        </DialogHeader>

        <section aria-labelledby="csv-header-rule" className="rounded-xl bg-muted p-3">
          <h3 id="csv-header-rule" className="font-semibold">
            The header row is required
          </h3>
          <p className="mt-1 text-muted-foreground">
            The first row must name the columns, spelt as below. They can be in any order, and you can leave out the optional ones.
          </p>
        </section>

        <dl className="flex flex-col divide-y divide-border">
          {columns.map((c) => (
            <div key={c.name} className="flex flex-col gap-1 py-2.5">
              <dt className="flex items-center gap-2">
                <code className="font-mono text-[13px] font-semibold">{c.name}</code>
                {c.required ? <Badge>Required</Badge> : <Badge variant="outline">Optional</Badge>}
              </dt>
              <dd className="text-muted-foreground">{c.description}</dd>
              <dd className="text-muted-foreground">
                e.g. <code className="font-mono text-[13px] text-foreground">{c.example}</code>
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-1 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Teams:</span> {teams.join(", ")}
          </p>
          <p>If any row has a problem, nothing is imported and you&apos;ll see what to fix.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
