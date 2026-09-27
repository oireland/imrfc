"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { BottomSheet, SheetSaveButton } from "@/components/bottom-sheet";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Action = (input: { name: string; homeId: string }) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;

/** The full-width "+ Add kit" button: opens the New kit sheet. */
export function AddKitButton({ stores, action }: { stores: { id: string; name: string }[]; action: Action }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ size: "lg", className: "h-11 w-full" })}>
        <Plus aria-hidden="true" />
        Add kit
      </button>
      {open && <AddKitSheet stores={stores} action={action} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddKitSheet({ stores, action, onClose }: { stores: { id: string; name: string }[]; action: Action; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [homeId, setHomeId] = useState(stores.length === 1 ? stores[0].id : "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await action({ name, homeId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Kit added");
      onClose();
      router.refresh();
    });
  }

  return (
    <BottomSheet eyebrow="New kit" onSubmit={save} onClose={onClose}>
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
      <SheetSaveButton pending={pending} />
    </BottomSheet>
  );
}
