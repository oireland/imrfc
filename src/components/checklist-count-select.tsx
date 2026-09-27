"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/** How many of a Kit Unit a Checklist line asks for; auto-submits its form on change. */
export function ChecklistCountSelect({
  kitUnitId,
  quantity,
  count,
}: {
  kitUnitId: string;
  quantity: number;
  count: number | null;
}) {
  return (
    <>
      <input type="hidden" name="kitUnitId" value={kitUnitId} />
      <NativeSelect
        name="count"
        size="sm"
        defaultValue={count === null ? "all" : String(count)}
        aria-label="How many"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <NativeSelectOption value="all">All</NativeSelectOption>
        {Array.from({ length: quantity }, (_, i) => i + 1).map((n) => (
          <NativeSelectOption key={n} value={String(n)}>
            {n}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </>
  );
}
