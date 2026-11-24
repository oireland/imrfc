"use client";

import { joinList } from "@/lib/text/join-names";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleAlert, Loader2, Minus, Plus, Star, X } from "lucide-react";
import { cn } from "cn";
import { AddEquipmentButton, EditToggle, KitRow, ResetLink, useKitEditing, type KitEditing } from "@/components/kit-editing";
import { parsePlaceKey } from "@/features/equipment/client";
import type { DutyAction, DutyRequest, HolderPart, SourcePart } from "@/features/duties";
import type { Result } from "@/lib/result";

/** A candidate Place the confirm sheet's "where from" step can move counts between. */
export type SourceOption = { value: string; label: string; count: number };
/** A candidate final Holder the confirm sheet's "who has how many" step can split across. */
export type HolderOption = { userId: string; name: string; count: number };

/** One Duty as the Event page shows it; plain data so it can cross to the client. */
export type DutySlot = {
  direction: "to" | "from";
  userIds: string[];
  /** Display names, same order as `userIds`. */
  people: string[];
  /** How many each of `userIds` is taking, same order; null means all of it. */
  counts: (number | null)[];
  /** Who has already marked their own part done, same order (only when everyone gave a number). */
  done: boolean[];
  /** How many of the line nobody has claimed yet (0 once someone is on it without a number). */
  unclaimed: number;
  /** The viewer is one of `userIds`. */
  mine: boolean;
  confirmed: boolean;
  voided: boolean;
  /** What the signed-in User may do with it (from `dutyActions`). */
  actions: DutyAction[];
  /** From Duties: the current Destination as a place `value`. */
  destination?: string;
  /** Only set when `actions` includes "confirm": whether — and how — to ask before confirming. */
  needsSourceChoice: boolean;
  sourceOptions: SourceOption[];
  needsHolderChoice: boolean;
  holderOptions: HolderOption[];
  /** A From Duty handed on while the unit is still with someone else: "Tom has it from Sam", one per way to Confirm. */
  handedOn: { label: string; sources: SourcePart[] }[];
};

export type DutyEquipment = {
  equipmentUnitId: string;
  equipmentName: string;
  /** The Checklist line's effective count, and the Equipment Unit's Quantity (shown as "×N" only when > 1). */
  count: number;
  quantity: number;
  /** Where it is now, e.g. "In Reynold's Locker". */
  now: string;
  /** Where the From Duty ends, e.g. "Reynold's Locker" or "stays with Priya & Tom". */
  goesBackTo: string;
  /** Where the From Duty could end instead, for Committee to choose from. */
  places: Place[];
  /** Display names of everyone with a Duty on it, asked about before it comes off the list. */
  affected: string[];
  to: DutySlot;
  from: DutySlot;
  headsUps: string[];
};

type Place = { value: string; label: string };

/** Search appears in the person picker once the list is longer than this. */
const SEARCH_FROM = 6;

/** How many of a line of `total` are taken, when only some are (everyone gave a number and it falls short); otherwise null. */
const partlyTaken = (slot: DutySlot, total: number) => {
  if (total < 2 || slot.counts.length === 0 || slot.counts.some((c) => c === null)) return null;
  const taken = slot.counts.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  return taken < total ? taken : null;
};

/** Names, with "(2)" after anyone taking only part of a line of more than one. */
const peopleWithCounts = (slot: DutySlot, total: number) =>
  joinList(
    slot.people.map((name, i) => {
      const bits = [total > 1 && slot.counts[i] != null ? String(slot.counts[i]) : null, slot.done[i] && !slot.confirmed ? "done" : null].filter(Boolean);
      return bits.length > 0 ? `${name} (${bits.join(", ")})` : name;
    }),
  );

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className="rounded-full bg-card p-2 shadow-card disabled:opacity-40"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="w-6 text-center text-lg font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`One more ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="rounded-full bg-card p-2 shadow-card disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}

const verb = (d: DutySlot) => (d.direction === "to" ? "Bring" : "Take back");
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Avatar({ mine, people }: { mine: boolean; people: string[] }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
          mine
            ? "bg-accent text-accent-foreground"
            : people.length > 0
              ? "bg-card text-foreground shadow-card"
              : "border border-dashed border-muted-foreground/50 text-muted-foreground",
        )}
      >
        {mine ? <Star className="size-3.5" /> : people.length > 0 ? initials(people[0]) : "?"}
      </span>
      {people.length > 1 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground ring-2 ring-card"
        >
          +{people.length - 1}
        </span>
      )}
    </span>
  );
}

/**
 * "Who's bringing what": one row per Equipment Unit on the Checklist, with the trip there
 * and the trip back as two slots. Tapping a slot opens a sheet with what you can do.
 */
export function EventDuties({
  equipment,
  eventTitle,
  soon,
  viewerId,
  people,
  act,
  kit,
  listSource,
}: {
  equipment: DutyEquipment[];
  eventTitle: string;
  /** The Event starts within 48 hours: unfilled slots say so. */
  soon: boolean;
  viewerId: string;
  people: { id: string; name: string }[];
  act: (equipmentUnitId: string, direction: DutySlot["direction"], request: DutyRequest) => Promise<Result>;
  /** Committee only, and not for a Cancelled Event: what it takes to edit the list. */
  kit?: KitEditing;
  /** Where the list comes from, e.g. "From its series"; shown to Committee beside the editing controls. */
  listSource?: string;
}) {
  const editing = useKitEditing(kit);
  // Ids, not the objects: the sheet must show fresh data after each action refreshes the page.
  const [open, setOpen] = useState<{ equipmentUnitId: string; direction: DutySlot["direction"] } | null>(null);
  const openItem = open && equipment.find((k) => k.equipmentUnitId === open.equipmentUnitId);
  const openSlot = openItem && (open.direction === "to" ? openItem.to : openItem.from);
  const done = equipment.flatMap((k) => [k.to, k.from]).filter((d) => d.confirmed).length;

  return (
    <section aria-labelledby="duties" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="duties" className="font-heading text-[28px] leading-none">
          Who&apos;s bringing what
        </h2>
        <span className="flex items-center gap-3">
          {equipment.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {done} of {equipment.length * 2} done
            </span>
          )}
          {kit && <EditToggle state={editing} />}
        </span>
      </div>

      {kit && listSource && <p className="-mt-1 px-1 text-sm text-muted-foreground">{listSource}</p>}

      {equipment.length === 0 ? (
        <p className="rounded-3xl bg-card px-5 py-6 text-sm text-muted-foreground shadow-card">
          {kit ? "Nothing on the list yet." : "No equipment needed for this one."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-3xl bg-card shadow-card">
          {equipment.map((item) => (
            <li key={item.equipmentUnitId} className="flex flex-col gap-3 px-4 py-4">
              <KitRow
                state={editing}
                item={{
                  equipmentUnitId: item.equipmentUnitId,
                  name: item.equipmentName,
                  quantity: item.quantity,
                  count: item.count,
                  affected: item.affected,
                }}
              >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-heading text-[22px] leading-none">
                      {item.equipmentName}
                      {item.quantity > 1 && ` ×${item.count}`}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{item.now}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[item.to, item.from].map((slot) => (
                      <Slot key={slot.direction} slot={slot} total={item.count} equipmentName={item.equipmentName} soon={soon} onOpen={() => setOpen({ equipmentUnitId: item.equipmentUnitId, direction: slot.direction })} />
                    ))}
                  </div>
                  {item.headsUps.map((text) => (
                    <p key={text} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                      {text}
                    </p>
                  ))}
              </KitRow>
            </li>
          ))}
        </ul>
      )}

      {kit && (
        <>
          <ResetLink state={editing} kit={kit} />
          <AddEquipmentButton state={editing} />
          {editing.sheets}
        </>
      )}

      {openItem && openSlot && (
        <DutySheet
          key={openSlot.direction}
          item={openItem}
          slot={openSlot}
          eventTitle={eventTitle}
          viewerId={viewerId}
          people={people}
          act={act}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function Slot({ slot, total, equipmentName, soon, onOpen }: { slot: DutySlot; total: number; equipmentName: string; soon: boolean; onOpen: () => void }) {
  const Icon = slot.direction === "to" ? ArrowUpRight : ArrowDownLeft;
  const personLabel = joinList(slot.people);
  const taken = partlyTaken(slot, total);
  const soloYou = slot.mine && slot.people.length === 1;
  const label = `${verb(slot)} ${equipmentName}: ${slot.voided ? "cancelled" : soloYou ? "you" : personLabel || "nobody yet"}${taken !== null ? `, ${taken} of ${total}` : ""}${slot.confirmed ? ", done" : ""}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={slot.voided}
      aria-label={label}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-2xl p-2 text-left transition-transform active:scale-[0.98] disabled:opacity-60",
        slot.mine ? "bg-accent/20 ring-1 ring-accent" : slot.people.length > 0 ? "bg-muted" : "border border-dashed border-border",
      )}
    >
      <Avatar mine={slot.mine} people={slot.people} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3" aria-hidden="true" />
          {verb(slot)}
        </span>
        <span className={cn("block truncate text-sm font-medium", slot.confirmed && "text-muted-foreground")}>
          {slot.voided ? (
            "Cancelled"
          ) : personLabel ? (
            personLabel
          ) : soon ? (
            <span className="text-destructive-text">Needs someone</span>
          ) : (
            <span className="text-muted-foreground">Up for grabs</span>
          )}
        </span>
        {taken !== null && (
          <span className="mt-1 flex items-center gap-1.5">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
              <span className="block h-full rounded-full bg-foreground" style={{ width: `${(taken / total) * 100}%` }} />
            </span>
            <span className="text-[11px] text-muted-foreground">
              {taken} of {total}
            </span>
          </span>
        )}
      </span>
      {slot.confirmed && <Check className="size-4 shrink-0" aria-hidden="true" />}
    </button>
  );
}

type View = "main" | "people" | "assign" | "share" | "places" | "confirmSplit" | "handedOn";

function DutySheet({
  item,
  slot,
  eventTitle,
  viewerId,
  people,
  act,
  onClose,
}: {
  item: DutyEquipment;
  slot: DutySlot;
  eventTitle: string;
  viewerId: string;
  people: { id: string; name: string }[];
  act: (equipmentUnitId: string, direction: DutySlot["direction"], request: DutyRequest) => Promise<Result>;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("main");
  const [query, setQuery] = useState("");
  // Who was on it when the "Who's doing it?" list opened: they stay at the top, even as the ticks change.
  const [pinned, setPinned] = useState<string[]>([]);
  const [wanted, setWanted] = useState<number | null>(null);
  const [newShare, setNewShare] = useState<number | null>(null);
  // The visible area above the on-screen keyboard, so the sheet (and its list) sits above it.
  const [viewport, setViewport] = useState<{ top: number; height: number } | null>(null);
  const [sources, setSources] = useState<Record<string, number>>(() =>
    Object.fromEntries(slot.sourceOptions.map((s) => [s.value, s.count])),
  );
  const [holders, setHolders] = useState<Record<string, number>>(() =>
    Object.fromEntries(slot.holderOptions.map((h) => [h.userId, h.count])),
  );
  const [pending, startTransition] = useTransition();
  const can = (a: DutyAction) => slot.actions.includes(a);
  const personLabel = peopleWithCounts(slot, item.count);
  const taken = partlyTaken(slot, item.count);
  // Only some of the line is left: say how many you're taking, so it isn't all or nothing.
  const shareable = item.count > 1 && slot.unclaimed > 0;
  const myIndex = slot.userIds.indexOf(viewerId);
  const othersTaking = slot.counts.reduce<number>((sum, c, i) => (i === myIndex ? sum : sum + (c ?? 0)), 0);
  const mostICanTake = item.count - othersTaking;
  const myShare = Math.min(newShare ?? slot.counts[myIndex] ?? mostICanTake, mostICanTake);
  const numbered = item.count > 1 && slot.counts.every((c) => c !== null);
  const take = Math.min(wanted ?? slot.unclaimed, slot.unclaimed);
  // Taking the whole line from nobody-else is a plain claim; otherwise say how many.
  const partial = shareable && (take < slot.unclaimed || slot.unclaimed < item.count);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ top: vv.offsetTop, height: vv.height });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function run(request: DutyRequest, success: string, { close = true }: { close?: boolean } = {}) {
    startTransition(async () => {
      const result = await act(item.equipmentUnitId, slot.direction, request);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      if (close) onClose();
    });
  }

  function startConfirm() {
    if (slot.handedOn.length > 0) {
      setView("handedOn");
      return;
    }
    if (slot.needsSourceChoice || slot.needsHolderChoice) {
      setView("confirmSplit");
      return;
    }
    run({ action: "confirm" }, "Marked as done");
  }

  function submitConfirm() {
    const from: SourcePart[] | undefined = slot.needsSourceChoice
      ? slot.sourceOptions.map((s) => ({ place: parsePlaceKey(s.value), count: sources[s.value] ?? 0 }))
      : undefined;
    const holderParts: HolderPart[] | undefined = slot.needsHolderChoice
      ? slot.holderOptions.map((h) => ({ userId: h.userId, count: holders[h.userId] ?? 0 }))
      : undefined;
    run({ action: "confirm", from, holders: holderParts }, "Marked as done");
  }

  const sourceTotal = Object.values(sources).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  const holderTotal = Object.values(holders).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  const sourceValid = !slot.needsSourceChoice || sourceTotal === item.count;
  const holderValid = !slot.needsHolderChoice || holderTotal === item.count;

  const choosable = people.filter((p) => !slot.userIds.includes(p.id));
  const shown = choosable.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const trip = slot.direction === "to" ? `Bring to ${eventTitle}` : `Take back from ${eventTitle}`;

  return (
    <div
      className="fixed inset-x-0 z-50 flex items-end justify-center"
      style={viewport ? { top: viewport.top, height: viewport.height } : { top: 0, bottom: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="duty-sheet-title"
    >
      <button type="button" aria-label="Close" className="absolute inset-0 animate-in bg-black/50 backdrop-blur-sm fade-in" onClick={onClose} />
      <div className="relative flex max-h-[88%] w-full max-w-2xl animate-in flex-col rounded-t-[28px] bg-popover px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] text-popover-foreground shadow-2xl duration-300 slide-in-from-bottom">
        <div className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-border" />
        <div className="mb-5 flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {view === "main" ? (
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{trip}</p>
            ) : (
              <button
                type="button"
                onClick={() => setView("main")}
                className="-ml-1 flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden="true" /> Back
              </button>
            )}
            <p id="duty-sheet-title" className="font-heading text-[30px] leading-tight">
              {view === "people"
                ? "Hand it on to"
                : view === "assign"
                  ? "Who's doing it?"
                  : view === "share"
                    ? "How many are you taking?"
                    : view === "places"
                      ? "Where it goes back to"
                      : view === "confirmSplit"
                        ? "Before we mark it done"
                        : item.equipmentName}
            </p>
            {view === "main" && (
              <p className="text-sm text-muted-foreground">{slot.direction === "to" ? item.now : `Goes back to ${item.goesBackTo}`}</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-full bg-muted p-2">
            <X className="size-4" />
          </button>
        </div>

        {view === "main" && (
          <div className="flex flex-col gap-2">
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-muted p-3">
              <Avatar mine={slot.mine} people={slot.people} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{personLabel || "Nobody yet"}</p>
                <p className="text-xs text-muted-foreground">
                  {slot.confirmed
                    ? "Done"
                    : taken !== null
                      ? `${taken} of ${item.count} taken, ${item.count - taken} still needed`
                      : slot.people.length > 0
                        ? "Not done yet"
                        : "Up for grabs"}
                </p>
              </div>
              {slot.confirmed && <Check className="size-5" aria-hidden="true" />}
            </div>

            {can("claim") && shareable && slot.unclaimed > 1 && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-2">
                <span className="text-sm">How many will you {slot.direction === "to" ? "bring" : "take back"}?</span>
                <Stepper value={take} max={slot.unclaimed} onChange={setWanted} label="" />
              </div>
            )}
            {can("claim") && (
              <PrimaryButton
                pending={pending}
                onClick={() =>
                  run(
                    partial ? { action: "claim", count: take } : { action: "claim" },
                    slot.direction === "to"
                      ? `You're bringing ${item.equipmentName}`
                      : `You're taking ${item.equipmentName} back`,
                  )
                }
              >
                {slot.people.length > 0 ? "Join in" : "I'll do it"}
              </PrimaryButton>
            )}
            {can("confirm") && (
              <PrimaryButton pending={pending} onClick={startConfirm}>
                {slot.direction === "to" ? "It's there — mark as done" : "It's back — mark as done"}
              </PrimaryButton>
            )}
            {can("setShare") && item.count > 1 && (
              <RowButton label="Change how many I'm taking" value={String(slot.counts[myIndex] ?? item.count)} onClick={() => setView("share")} />
            )}
            {can("handOn") && <RowButton label="Hand it on to someone else" onClick={() => setView("people")} />}
            {can("assign") && <RowButton label="Manage who's doing it" onClick={() => {
              setPinned(slot.userIds);
              setView("assign");
            }} />}
            {can("setDestination") && <RowButton label="Goes back to" value={item.goesBackTo} onClick={() => setView("places")} />}
            {can("leave") && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run({ action: "leave" }, "You're off it")}
                className="mt-1 py-2 text-sm font-medium text-destructive-text disabled:opacity-50"
              >
                Take yourself off this
              </button>
            )}
            {slot.actions.length === 0 && !slot.confirmed && (
              <p className="text-sm text-muted-foreground">Only {personLabel || "they"} or the committee can change this one.</p>
            )}
          </div>
        )}

        {view === "people" && (
          <div className="flex min-h-0 flex-col gap-2">
            {choosable.length > SEARCH_FROM && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people"
                aria-label="Search people"
                className="h-11 shrink-0 rounded-2xl bg-muted px-4 text-base outline-none placeholder:text-muted-foreground"
              />
            )}
            <ul className="-mx-2 min-h-0 overflow-y-auto">
              {shown.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run({ action: "handOn", userId: p.id }, `${p.name} is on it now`)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-muted disabled:hover:bg-transparent"
                  >
                    <Avatar mine={p.id === viewerId} people={[p.name]} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {p.name}
                      {p.id === viewerId && <span className="font-normal text-muted-foreground"> (you)</span>}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Nobody by that name.</li>}
            </ul>
          </div>
        )}

        {view === "assign" && (
          <div className="flex min-h-0 flex-col gap-2">
            {people.length > SEARCH_FROM && (
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people"
                aria-label="Search people"
                className="h-11 shrink-0 rounded-2xl bg-muted px-4 text-base outline-none placeholder:text-muted-foreground"
              />
            )}
            <ul className="-mx-2 min-h-0 overflow-y-auto">
              {[...people]
                .sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)))
                .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
                .map((p) => {
                  const at = slot.userIds.indexOf(p.id);
                  const on = at >= 0;
                  const finished = on && slot.done[at];
                  const theirs = slot.counts[at];
                  const toggle = () => {
                    if (!on && numbered && slot.unclaimed === 0) {
                      toast.error("It's all taken: lower someone else's number first.");
                      return;
                    }
                    run(
                      {
                        action: "assign",
                        userIds: on ? slot.userIds.filter((id) => id !== p.id) : [...slot.userIds, p.id],
                        counts: !on && numbered ? { [p.id]: slot.unclaimed } : undefined,
                      },
                      on ? `${p.name} is off it` : `${p.name} is on it`,
                      { close: false },
                    );
                  };
                  return (
                    <li key={p.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pending || finished}
                        onClick={toggle}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-muted disabled:hover:bg-transparent"
                      >
                        <Avatar mine={p.id === viewerId} people={[p.name]} />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {p.name}
                          {p.id === viewerId && <span className="font-normal text-muted-foreground"> (you)</span>}
                        </span>
                        {finished ? (
                          <span className="shrink-0 text-xs text-muted-foreground">Done</span>
                        ) : (
                          on && <Check className="size-4 shrink-0" aria-label="On it" />
                        )}
                      </button>
                      {on && numbered && !finished && theirs !== null && (
                        <Stepper
                          value={theirs}
                          max={theirs + slot.unclaimed}
                          label={`for ${p.name}`}
                          onChange={(n) => run({ action: "assign", userIds: slot.userIds, counts: { [p.id]: n } }, `${p.name} is taking ${n}`, { close: false })}
                        />
                      )}
                      {finished && theirs !== null && item.count > 1 && <span className="shrink-0 pr-2 text-sm tabular-nums">{theirs}</span>}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}

        {view === "share" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-2">
              <span className="text-sm">Out of {item.count}</span>
              <Stepper value={myShare} max={mostICanTake} onChange={setNewShare} label="" />
            </div>
            <PrimaryButton pending={pending} onClick={() => run({ action: "setShare", count: myShare }, `You're taking ${myShare}`)}>
              Save
            </PrimaryButton>
          </div>
        )}

        {view === "places" && (
          <ul className="-mx-2 min-h-0 overflow-y-auto">
            {item.places.map((place) => {
              const current = place.value === slot.destination;
              return (
                <li key={place.value}>
                  <button
                    type="button"
                    disabled={pending || current}
                    onClick={() => run({ action: "setDestination", destination: toDestination(place.value) }, `Goes back to ${place.label}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left font-medium hover:bg-muted disabled:hover:bg-transparent"
                  >
                    {place.label}
                    {current && <Check className="size-4 shrink-0" aria-label="Current" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {view === "handedOn" && (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <p className="text-sm text-muted-foreground">Nothing&apos;s with {personLabel} yet. Who did it come from?</p>
            {slot.handedOn.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={pending}
                onClick={() => run({ action: "confirm", from: option.sources }, "Marked as done")}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-muted px-3 text-base font-semibold disabled:opacity-60"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {view === "confirmSplit" && (
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
            {slot.needsSourceChoice && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Where&apos;s it coming from?</p>
                {slot.sourceOptions.map((s) => (
                  <label key={s.value} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2">
                    <span className="min-w-0 truncate text-sm">{s.label}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={s.label}
                      value={sources[s.value] ?? 0}
                      onChange={(e) => setSources((cur) => ({ ...cur, [s.value]: Number(e.target.value) }))}
                      className="h-9 w-16 rounded-xl border border-border bg-card px-2 text-right text-sm outline-none"
                    />
                  </label>
                ))}
                <p className={cn("text-xs", sourceValid ? "text-muted-foreground" : "text-destructive-text")}>
                  {sourceTotal} of {item.count}
                </p>
              </div>
            )}
            {slot.needsHolderChoice && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Who has how many?</p>
                {slot.holderOptions.map((h) => (
                  <label key={h.userId} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2">
                    <span className="min-w-0 truncate text-sm">{h.name}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={h.name}
                      value={holders[h.userId] ?? 0}
                      onChange={(e) => setHolders((cur) => ({ ...cur, [h.userId]: Number(e.target.value) }))}
                      className="h-9 w-16 rounded-xl border border-border bg-card px-2 text-right text-sm outline-none"
                    />
                  </label>
                ))}
                <p className={cn("text-xs", holderValid ? "text-muted-foreground" : "text-destructive-text")}>
                  {holderTotal} of {item.count}
                </p>
              </div>
            )}
            <PrimaryButton pending={pending || !sourceValid || !holderValid} onClick={submitConfirm}>
              Mark as done
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** Place values: "home", "store:<id>", or "holder" (stays with whoever takes it back). */
function toDestination(value: string): Extract<DutyRequest, { action: "setDestination" }>["destination"] {
  if (value === "holder") return { type: "holder" };
  if (value.startsWith("store:")) return { type: "store", storeId: value.slice("store:".length) };
  return { type: "home" };
}

function PrimaryButton({ pending, onClick, children }: { pending: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

function RowButton({ label, value, onClick }: { label: string; value?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center gap-2 rounded-2xl border border-border px-4 text-left text-sm hover:bg-muted"
    >
      <span className={cn("shrink-0", value ? "text-muted-foreground" : "font-medium")}>{label}</span>
      {value && <span className="min-w-0 flex-1 truncate text-right font-medium">{value}</span>}
      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground", !value && "ml-auto")} aria-hidden="true" />
    </button>
  );
}
