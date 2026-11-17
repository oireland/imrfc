"use client";

import { joinList } from "@/lib/join-names";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Minus, Pencil, Plus } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Result } from "@/lib/result";


/** One Equipment Unit that can be added to a kit list. */
export type KitOption = { id: string; name: string; /** Its Home, e.g. "Reynolds Locker". */ subtitle: string; quantity: number };

/** What the kit list needs from the server to be edited; plain data and server actions, so it can cross to the client. */
export type KitEditing = {
  options: KitOption[];
  add: (equipmentUnitId: string, count: number | null) => Promise<Result>;
  remove: (equipmentUnitId: string) => Promise<Result>;
  setCount: (equipmentUnitId: string, count: number | null) => Promise<Result>;
  /** Drops the list's own changes, falling back to the list it started from. Absent when there is nothing to fall back to. */
  reset?: {
    /** e.g. "the default list". */
    label: string;
    /** Display names of everyone whose Duties would go with it. */
    affected: string[];
    run: () => Promise<Result>;
  };
};

/** A line on the list, as the edit controls need to see it. */
export type KitItem = {
  equipmentUnitId: string;
  name: string;
  quantity: number;
  /** How many the list asks for. */
  count: number;
  /** Display names of everyone with a Duty on it. */
  affected: string[];
};

/** State and sheets for editing a kit list: the Edit toggle, per-row controls, Add and Remove. */
export function useKitEditing(kit: KitEditing | undefined) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<KitItem | null>(null);
  const [resetting, setResetting] = useState(false);
  const [countFor, setCountFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Runs a server action; the page refreshes itself, so there is only a failure to report. */
  const run = (action: () => Promise<Result>, then?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
      else then?.();
    });

  const toggle = () => {
    setEditing((on) => !on);
    setCountFor(null);
  };
  const askToRemove = (item: KitItem) => {
    if (!kit) return;
    if (item.affected.length > 0) setRemoving(item);
    else run(() => kit.remove(item.equipmentUnitId));
  };
  const askToReset = () => {
    if (!kit?.reset) return;
    if (kit.reset.affected.length > 0) setResetting(true);
    else run(kit.reset.run);
  };

  const sheets = kit && (
    <>
      {adding && (
        <AddSheet
          options={kit.options}
          pending={pending}
          onAdd={(option, count) => run(() => kit.add(option.id, count), () => toast.success(`Added ${option.name}`))}
          onClose={() => setAdding(false)}
        />
      )}
      {removing && (
        <ConfirmSheet
          eyebrow="Take off the list"
          title={`Take ${removing.name} off the list?`}
          body={`Taking it off drops the jobs on it (${joinList(removing.affected, "and")}).`}
          confirmLabel="Take it off"
          keepLabel="Keep it"
          onConfirm={() => run(() => kit.remove(removing.equipmentUnitId))}
          onClose={() => setRemoving(null)}
        />
      )}
      {resetting && kit.reset && (
        <ConfirmSheet
          eyebrow="Go back"
          title={`Go back to ${kit.reset.label}?`}
          body={`Going back drops the jobs on kit that isn't on ${kit.reset.label} (${joinList(kit.reset.affected, "and")}).`}
          confirmLabel="Go back"
          keepLabel="Keep this list"
          onConfirm={() => run(kit.reset!.run)}
          onClose={() => setResetting(false)}
        />
      )}
    </>
  );

  return {
    editing,
    pending,
    toggle,
    openAdd: () => setAdding(true),
    askToRemove,
    askToReset,
    countFor,
    setCountFor,
    changeCount: (item: KitItem, count: number | null) => {
      if (!kit) return;
      setCountFor(null);
      run(() => kit.setCount(item.equipmentUnitId, count));
    },
    sheets,
  };
}

export type KitEditingState = ReturnType<typeof useKitEditing>;

/** The Edit / Done toggle that sits at the top of the list. */
export function EditToggle({ state }: { state: KitEditingState }) {
  return (
    <Button type="button" variant="outline" size="sm" aria-pressed={state.editing} onClick={state.toggle}>
      {state.editing ? "Done" : "Edit"}
    </Button>
  );
}

/** The button at the foot of the list. */
export function AddEquipmentButton({ state }: { state: KitEditingState }) {
  return (
    <Button type="button" variant="outline" className="h-12 w-full rounded-2xl border-dashed" onClick={state.openAdd}>
      <Plus aria-hidden="true" /> Add equipment
    </Button>
  );
}

/** "Go back to the default list", shown inside edit mode. */
export function ResetLink({ state, kit }: { state: KitEditingState; kit: KitEditing }) {
  if (!state.editing || !kit.reset) return null;
  return (
    <Button type="button" variant="link" size="sm" className="self-start" onClick={state.askToReset} disabled={state.pending}>
      Go back to {kit.reset.label}
    </Button>
  );
}

/** One line of the list: while editing, its content shifts right to make room for Edit and Remove. */
export function KitRow({ item, state, children }: { item: KitItem; state: KitEditingState; children: React.ReactNode }) {
  if (!state.editing) return <>{children}</>;
  const pickingCount = state.countFor === item.equipmentUnitId;
  return (
    <div className="flex items-start gap-3">
      <div className="flex shrink-0 animate-in items-center gap-2 fade-in slide-in-from-left-2">
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="rounded-full"
          aria-label={`Remove ${item.name}`}
          disabled={state.pending}
          onClick={() => state.askToRemove(item)}
        >
          <Minus aria-hidden="true" />
        </Button>
        {item.quantity > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={`Edit ${item.name}`}
            aria-expanded={pickingCount}
            onClick={() => state.setCountFor(pickingCount ? null : item.equipmentUnitId)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          // Keeps the names lined up with rows that have an Edit button.
          <span aria-hidden="true" className="size-8" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {pickingCount && (
          <label className="flex items-center gap-2 text-sm">
            How many {item.name}?
            <NativeSelect
              size="sm"
              defaultValue={item.count >= item.quantity ? "all" : String(item.count)}
              onChange={(e) => state.changeCount(item, e.currentTarget.value === "all" ? null : Number(e.currentTarget.value))}
            >
              <NativeSelectOption value="all">All</NativeSelectOption>
              {Array.from({ length: item.quantity - 1 }, (_, i) => i + 1).map((n) => (
                <NativeSelectOption key={n} value={String(n)}>
                  {n}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
        {children}
      </div>
    </div>
  );
}

function AddSheet({
  options,
  pending,
  onAdd,
  onClose,
}: {
  options: KitOption[];
  pending: boolean;
  onAdd: (option: KitOption, count: number | null) => void;
  onClose: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  return (
    <BottomSheet
      eyebrow="Add equipment"
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {options.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">Everything&apos;s already on the list.</p>
      ) : (
        <ul className="mb-4 flex flex-col divide-y divide-border">
          {options.map((option) => (
            <li key={option.id} className="flex items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{option.name}</span>
                <span className="truncate text-xs text-muted-foreground">{option.subtitle}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {option.quantity > 1 && (
                  <NativeSelect
                    size="sm"
                    aria-label={`How many ${option.name}`}
                    value={counts[option.id] ?? "all"}
                    onChange={(e) => {
                      const picked = e.currentTarget.value;
                      setCounts((c) => ({ ...c, [option.id]: picked }));
                    }}
                  >
                    <NativeSelectOption value="all">All</NativeSelectOption>
                    {Array.from({ length: option.quantity - 1 }, (_, i) => i + 1).map((n) => (
                      <NativeSelectOption key={n} value={String(n)}>
                        {n}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
                <Button
                  type="button"
                  size="sm"
                  aria-label={`Add ${option.name}`}
                  disabled={pending}
                  onClick={() => {
                    const picked = counts[option.id] ?? "all";
                    onAdd(option, picked === "all" ? null : Number(picked));
                  }}
                >
                  Add
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Button type="submit" className="h-12 w-full rounded-2xl text-base">
        Done
      </Button>
    </BottomSheet>
  );
}

function ConfirmSheet({
  eyebrow,
  title,
  body,
  confirmLabel,
  keepLabel,
  onConfirm,
  onClose,
}: {
  eyebrow: string;
  title: string;
  body: string;
  confirmLabel: string;
  keepLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      eyebrow={eyebrow}
      title={title}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm();
        onClose();
      }}
    >
      <p className="mb-5 text-sm text-muted-foreground">{body}</p>
      <div className="flex flex-col gap-2">
        <Button type="submit" variant="destructive" className="h-12 w-full rounded-2xl text-base">
          {confirmLabel}
        </Button>
        <Button type="button" variant="outline" className="h-12 w-full rounded-2xl text-base" onClick={onClose}>
          {keepLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}
