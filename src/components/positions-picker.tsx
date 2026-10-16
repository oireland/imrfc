"use client";

import { useId, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RUGBY_POSITIONS, type RugbyPosition } from "@/features/users";

/**
 * A Player's Preferred and Other Positions, on Profile and the Committee's Player page.
 * Every change saves straight away.
 */
export function PositionsPicker({
  initialPreferred,
  initialOther,
  save,
}: {
  initialPreferred: RugbyPosition | null;
  initialOther: RugbyPosition[];
  save: (preferred: RugbyPosition, other: RugbyPosition[]) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [preferred, setPreferred] = useState<RugbyPosition | "">(initialPreferred ?? "");
  const [other, setOther] = useState<RugbyPosition[]>(initialOther.filter((p) => p !== initialPreferred));
  const [, startTransition] = useTransition();
  const selectId = useId();

  function saveAll(nextPreferred: RugbyPosition | "", nextOther: RugbyPosition[]) {
    // The Preferred Position is never also an Other Position.
    const cleanedOther = nextOther.filter((p) => p !== nextPreferred);
    setPreferred(nextPreferred);
    setOther(cleanedOther);
    if (!nextPreferred) return;
    startTransition(async () => {
      const result = await save(nextPreferred, cleanedOther);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Positions saved", { id: "positions-saved" });
    });
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={selectId}>Preferred Position</Label>
        <NativeSelect
          id={selectId}
          name="preferred"
          value={preferred}
          onChange={(e) => saveAll(e.target.value as RugbyPosition, other)}
          required
        >
          <NativeSelectOption value="" disabled>
            Choose a position
          </NativeSelectOption>
          {RUGBY_POSITIONS.map((position) => (
            <NativeSelectOption key={position} value={position}>
              {position}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center justify-between text-sm font-medium">
          Other Positions
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {RUGBY_POSITIONS.map((position) => {
            const isPreferred = position === preferred;
            return (
              <label
                key={position}
                className={cn("flex items-center gap-2 text-sm", isPreferred && "text-muted-foreground")}
              >
                <input
                  type="checkbox"
                  name="other"
                  value={position}
                  checked={other.includes(position)}
                  disabled={isPreferred}
                  onChange={(e) =>
                    saveAll(preferred, e.target.checked ? [...other, position] : other.filter((p) => p !== position))
                  }
                />
                {position}
              </label>
            );
          })}
        </CollapsibleContent>
      </Collapsible>
    </form>
  );
}
