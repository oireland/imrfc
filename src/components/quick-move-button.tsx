"use client";

import { useState, useTransition } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";

type Props = {
  action: (formData: FormData) => Promise<void>;
  /** Hidden fields the action needs to find the Portion (portionId, and kitUnitId on the Kit view). */
  fields: Record<string, string>;
  /** How many are in this Portion; above 1, you choose how many to move. */
  available: number;
  /** Where the quick Move goes: to me ("I've got it"), or back Home to the named Store. */
  returnTo: string | null;
  /** The kit's name as shown on the row, for the sheet title and screen readers. */
  name: string;
};

function verb(returnTo: string | null, count?: number) {
  if (returnTo) return count === undefined ? `Return to ${returnTo}` : `Return ${count} to ${returnTo}`;
  return count === undefined ? "I've got it" : `I've got ${count}`;
}

/** − n + with the number typeable in between; posts as `count`. */
function CountStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.min(Math.max(n, 1), max);
  return (
    <div className="flex h-11 shrink-0 items-center rounded-full border border-border">
      <button
        type="button"
        aria-label="One fewer"
        disabled={value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        className="flex size-11 items-center justify-center rounded-full disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input
        type="number"
        name="count"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 1))}
        aria-label="How many"
        className="w-8 bg-transparent text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="One more"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="flex size-11 items-center justify-center rounded-full disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return Object.entries(fields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />);
}

/**
 * The Kit view's small quick-Move button. For a single thing it moves straight away;
 * when there are several, it opens a sheet to choose how many.
 */
export function QuickMoveRowButton({ action, fields, available, returnTo, name }: Props) {
  const [open, setOpen] = useState(false);
  const variant = returnTo ? "outline" : "default";
  const ariaLabel = returnTo ? `Return ${name} to ${returnTo}` : `I've got ${name}`;

  if (available <= 1) {
    return (
      <form action={action} className="relative z-10 shrink-0">
        <HiddenFields fields={fields} />
        <SubmitButton size="sm" variant={variant} aria-label={ariaLabel}>
          {verb(returnTo)}
        </SubmitButton>
      </form>
    );
  }

  return (
    <>
      <Button size="sm" variant={variant} aria-label={ariaLabel} onClick={() => setOpen(true)} className="relative z-10 shrink-0">
        {verb(returnTo)}
      </Button>
      {open && <QuickMoveSheet {...{ action, fields, available, returnTo, name }} onClose={() => setOpen(false)} />}
    </>
  );
}

function QuickMoveSheet({ action, fields, available, returnTo, name, onClose }: Props & { onClose: () => void }) {
  const [count, setCount] = useState(available);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(formData);
      onClose();
    });
  }

  return (
    <BottomSheet eyebrow={returnTo ? `Return to ${returnTo}` : "I've got it"} title={name} onSubmit={save} onClose={onClose}>
      <HiddenFields fields={fields} />
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          How many? <span className="text-foreground">{available} here</span>
        </p>
        <CountStepper value={count} max={available} onChange={setCount} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {count === available && available > 1 ? (returnTo ? `Return all ${count}` : `I've got all ${count}`) : verb(returnTo, count)}
      </button>
    </BottomSheet>
  );
}

/**
 * The detail page's full-width quick-Move button. When there are several, a − n + stepper
 * sits beside it and the button says how many will move.
 */
export function QuickMoveBlockButton({ action, fields, available, returnTo }: Omit<Props, "name">) {
  const [count, setCount] = useState(available);
  const variant = returnTo ? "outline" : "default";
  return (
    <form action={action} className="flex gap-2">
      <HiddenFields fields={fields} />
      {available > 1 && <CountStepper value={count} max={available} onChange={setCount} />}
      <SubmitButton size="lg" className="h-11 flex-1" variant={variant}>
        {available > 1 ? verb(returnTo, count) : verb(returnTo)}
      </SubmitButton>
    </form>
  );
}
