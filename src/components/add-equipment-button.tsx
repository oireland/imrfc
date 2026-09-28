"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { BottomSheet, SheetSaveButton } from "@/components/bottom-sheet";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Action = (input: {
  name: string;
  homeId: string;
  quantity?: number;
}) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

/** The full-width "+ Add equipment" button: opens the New equipment sheet. */
export function AddEquipmentButton({ stores, action }: { stores: { id: string; name: string }[]; action: Action }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ size: "lg", className: "h-11 w-full" })}>
        <Plus aria-hidden="true" />
        Add equipment
      </button>
      {open && <AddEquipmentSheet stores={stores} action={action} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddEquipmentSheet({ stores, action, onClose }: { stores: { id: string; name: string }[]; action: Action; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [homeId, setHomeId] = useState(stores.length === 1 ? stores[0].id : "");
  const [quantity, setQuantity] = useState("");

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await action({ name, homeId, quantity: quantity.trim() ? Number(quantity) : undefined });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Equipment added");
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet eyebrow="New equipment" onSubmit={save} onClose={onClose}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add name"
        aria-label="Name"
        required
        className="mb-4 w-full border-b border-border bg-transparent pb-2 text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
      />
      <div className="mb-5 flex flex-col gap-1.5">
        <NativeSelect aria-label="Home" value={homeId} onChange={(e) => setHomeId(e.target.value)} required className="w-full">
          <NativeSelectOption value="">Choose its home store…</NativeSelectOption>
          {stores.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">Where it lives, and where it goes back to after an event.</p>
      </div>
      <div className="mb-5 flex flex-col gap-1.5">
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="1"
          aria-label="Quantity"
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60"
        />
        <p className="text-xs text-muted-foreground">How many, if more than one (8 shields, 2 sets of cones). Leave blank for one.</p>
      </div>
      <SheetSaveButton pending={pending} />
    </BottomSheet>
  );
}
