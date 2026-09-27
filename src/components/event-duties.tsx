"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, CircleAlert, Loader2, Star, X } from "lucide-react";
import { cn } from "cn";
import type { DutyAction, DutyRequest } from "@/features/duties";

/** One Duty as the Event page shows it; plain data so it can cross to the client. */
export type DutySlot = {
  id: string;
  direction: "to" | "from";
  userId: string | null;
  /** "You", a name, or null when nobody is doing it. */
  person: string | null;
  mine: boolean;
  confirmed: boolean;
  voided: boolean;
  /** What the signed-in User may do with it (from `dutyActions`). */
  actions: DutyAction[];
  /** From Duties: the current Destination as a place `value`. */
  destination?: string;
};

export type DutyKit = {
  kitUnitId: string;
  kitName: string;
  /** The Checklist line's effective count, and the Kit Unit's Quantity (shown as "×N" only when > 1). */
  count: number;
  quantity: number;
  /** Where it is now, e.g. "In Reynold's Locker". */
  now: string;
  /** Where the From Duty ends, e.g. "Reynold's Locker" or "stays with Priya". */
  goesBackTo: string;
  /** Where the From Duty could end instead, for Committee to choose from. */
  places: Place[];
  to: DutySlot;
  from: DutySlot;
  headsUps: string[];
};

type Place = { value: string; label: string };
type Result = { ok: true } | { ok: false; error: string };

/** Search appears in the person picker once the list is longer than this. */
const SEARCH_FROM = 6;

const verb = (d: DutySlot) => (d.direction === "to" ? "Bring" : "Take back");
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Avatar({ slot }: { slot: Pick<DutySlot, "mine" | "person"> }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        slot.mine
          ? "bg-accent text-accent-foreground"
          : slot.person
            ? "bg-card text-foreground shadow-card"
            : "border border-dashed border-muted-foreground/50 text-muted-foreground",
      )}
    >
      {slot.mine ? <Star className="size-3.5" /> : slot.person ? initials(slot.person) : "?"}
    </span>
  );
}

/**
 * "Who's bringing what": one row per Kit Unit on the Checklist, with the trip there
 * and the trip back as two slots. Tapping a slot opens a sheet with what you can do.
 */
export function EventDuties({
  kit,
  eventTitle,
  soon,
  viewerId,
  people,
  act,
}: {
  kit: DutyKit[];
  eventTitle: string;
  /** The Event starts within 48 hours: unfilled slots say so. */
  soon: boolean;
  viewerId: string;
  people: { id: string; name: string }[];
  act: (dutyId: string, request: DutyRequest) => Promise<Result>;
}) {
  // Ids, not the objects: the sheet must show fresh data after each action refreshes the page.
  const [open, setOpen] = useState<{ kitUnitId: string; direction: DutySlot["direction"] } | null>(null);
  const openItem = open && kit.find((k) => k.kitUnitId === open.kitUnitId);
  const openSlot = openItem && (open.direction === "to" ? openItem.to : openItem.from);
  const done = kit.flatMap((k) => [k.to, k.from]).filter((d) => d.confirmed).length;

  return (
    <section aria-labelledby="duties" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="duties" className="font-heading text-[28px] leading-none">
          Who&apos;s bringing what
        </h2>
        {kit.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {done} of {kit.length * 2} done
          </span>
        )}
      </div>

      {kit.length === 0 ? (
        <p className="rounded-3xl bg-card px-5 py-6 text-sm text-muted-foreground shadow-card">No kit needed for this one.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-3xl bg-card shadow-card">
          {kit.map((item) => (
            <li key={item.kitUnitId} className="flex flex-col gap-3 px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-heading text-[22px] leading-none">
                  {item.kitName}
                  {item.quantity > 1 && ` ×${item.count}`}
                </span>
                <span className="truncate text-xs text-muted-foreground">{item.now}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[item.to, item.from].map((slot) => (
                  <Slot key={slot.id} slot={slot} kitName={item.kitName} soon={soon} onOpen={() => setOpen({ kitUnitId: item.kitUnitId, direction: slot.direction })} />
                ))}
              </div>
              {item.headsUps.map((text) => (
                <p key={text} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  {text}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}

      {openItem && openSlot && (
        <DutySheet
          key={openSlot.id}
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

function Slot({ slot, kitName, soon, onOpen }: { slot: DutySlot; kitName: string; soon: boolean; onOpen: () => void }) {
  const Icon = slot.direction === "to" ? ArrowUpRight : ArrowDownLeft;
  const label = `${verb(slot)} ${kitName}: ${slot.voided ? "cancelled" : slot.mine ? "you" : (slot.person ?? "nobody yet")}${slot.confirmed ? ", done" : ""}`;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={slot.voided}
      aria-label={label}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-2xl p-2 text-left transition-transform active:scale-[0.98] disabled:opacity-60",
        slot.mine ? "bg-accent/20 ring-1 ring-accent" : slot.person ? "bg-muted" : "border border-dashed border-border",
      )}
    >
      <Avatar slot={slot} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3" aria-hidden="true" />
          {verb(slot)}
        </span>
        <span className={cn("block truncate text-sm font-medium", slot.confirmed && "text-muted-foreground")}>
          {slot.voided ? (
            "Cancelled"
          ) : slot.person ? (
            slot.person
          ) : soon ? (
            <span className="text-destructive-text">Needs someone</span>
          ) : (
            <span className="text-muted-foreground">Up for grabs</span>
          )}
        </span>
      </span>
      {slot.confirmed && <Check className="size-4 shrink-0" aria-hidden="true" />}
    </button>
  );
}

type View = "main" | "people" | "places";

function DutySheet({
  item,
  slot,
  eventTitle,
  viewerId,
  people,
  act,
  onClose,
}: {
  item: DutyKit;
  slot: DutySlot;
  eventTitle: string;
  viewerId: string;
  people: { id: string; name: string }[];
  act: (dutyId: string, request: DutyRequest) => Promise<Result>;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("main");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const can = (a: DutyAction) => slot.actions.includes(a);
  const giveAction = can("assign") ? "assign" : can("handOn") ? "handOn" : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function run(request: DutyRequest, success: string) {
    startTransition(async () => {
      const result = await act(slot.id, request);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      onClose();
    });
  }

  const choosable = people.filter((p) => giveAction !== "handOn" || p.id !== viewerId);
  const shown = choosable.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const trip = slot.direction === "to" ? `Bring to ${eventTitle}` : `Take back from ${eventTitle}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="duty-sheet-title">
      <button type="button" aria-label="Close" className="absolute inset-0 animate-in bg-black/50 backdrop-blur-sm fade-in" onClick={onClose} />
      <div className="relative flex max-h-[88dvh] w-full max-w-2xl animate-in flex-col rounded-t-[28px] bg-popover px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+20px)] text-popover-foreground shadow-2xl duration-300 slide-in-from-bottom">
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
              {view === "people" ? (giveAction === "handOn" ? "Hand it on to" : "Who's doing it?") : view === "places" ? "Where it goes back to" : item.kitName}
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
              <Avatar slot={slot} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{slot.person ?? "Nobody yet"}</p>
                <p className="text-xs text-muted-foreground">{slot.confirmed ? "Done" : slot.person ? "Not done yet" : "Up for grabs"}</p>
              </div>
              {slot.confirmed && <Check className="size-5" aria-hidden="true" />}
            </div>

            {can("claim") && (
              <PrimaryButton pending={pending} onClick={() => run({ action: "claim" }, slot.direction === "to" ? `You're bringing ${item.kitName}` : `You're taking ${item.kitName} back`)}>
                I&apos;ll do it
              </PrimaryButton>
            )}
            {can("confirm") && (
              <PrimaryButton pending={pending} onClick={() => run({ action: "confirm" }, "Marked as done")}>
                {slot.direction === "to" ? "It's there — mark as done" : "It's back — mark as done"}
              </PrimaryButton>
            )}
            {giveAction && (
              <RowButton label={giveAction === "handOn" ? "Hand it on" : slot.person ? "Give it to someone else" : "Give it to someone"} onClick={() => setView("people")} />
            )}
            {can("setDestination") && <RowButton label="Goes back to" value={item.goesBackTo} onClick={() => setView("places")} />}
            {can("unassign") && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run({ action: "unassign" }, `${slot.mine ? "You're" : `${slot.person} is`} off it`)}
                className="mt-1 py-2 text-sm font-medium text-destructive-text disabled:opacity-50"
              >
                Take {slot.mine ? "yourself" : slot.person} off this
              </button>
            )}
            {slot.actions.length === 0 && !slot.confirmed && (
              <p className="text-sm text-muted-foreground">Only {slot.person ?? "they"} or the committee can change this one.</p>
            )}
          </div>
        )}

        {view === "people" && giveAction && (
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
              {shown.map((p) => {
                const current = p.id === slot.userId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={pending || current}
                      onClick={() => run({ action: giveAction, userId: p.id }, `${p.id === viewerId ? "You're" : `${p.name} is`} on it`)}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-muted disabled:hover:bg-transparent"
                    >
                      <Avatar slot={{ mine: p.id === viewerId, person: p.name }} />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {p.name}
                        {p.id === viewerId && <span className="font-normal text-muted-foreground"> (you)</span>}
                      </span>
                      {current && <Check className="size-4 shrink-0" aria-label="Doing it now" />}
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Nobody by that name.</li>}
            </ul>
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
