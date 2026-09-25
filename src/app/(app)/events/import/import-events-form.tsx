"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImportState } from "./actions";

/** Upload a CSV; on success toast and go to Events, otherwise list every problem. */
export function ImportEventsForm({ action }: { action: (prev: ImportState, formData: FormData) => Promise<ImportState> }) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, null);

  useEffect(() => {
    if (!state?.ok) return;
    toast.success(state.count === 1 ? "1 event imported" : `${state.count} events imported`);
    router.push("/events");
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="events-csv">CSV file</Label>
        <Input id="events-csv" type="file" name="file" accept=".csv,text/csv" required />
      </div>
      {state && !state.ok && (
        <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive-text">
          <p className="font-medium">Nothing was imported. Fix these and try again:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <SubmitButton size="lg" className="h-11" pendingLabel="Importing…">
        Import events
      </SubmitButton>
    </form>
  );
}
