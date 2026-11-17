"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Result } from "@/lib/result";


/** A Mobile number field that saves when you leave it or press Enter, if it changed. Empty removes the number. */
export function MobileNumberField({
  id,
  label,
  hint,
  initialNumber,
  save,
}: {
  id: string;
  label: string;
  hint?: string;
  initialNumber: string | null;
  save: (input: string) => Promise<Result>;
}) {
  const saved = useRef(initialNumber ?? "");
  const [, startTransition] = useTransition();

  function commit(input: HTMLInputElement) {
    const value = input.value.trim();
    if (value === saved.current) return;
    startTransition(async () => {
      const result = await save(value);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      saved.current = value;
      toast.success(value ? "Number saved" : "Number removed", { id: "mobile-number-saved" });
    });
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        commit(e.currentTarget.elements.namedItem("mobileNumber") as HTMLInputElement);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Input
        id={id}
        name="mobileNumber"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="07…"
        defaultValue={initialNumber ?? ""}
        enterKeyHint="done"
        onBlur={(e) => commit(e.currentTarget)}
      />
    </form>
  );
}
