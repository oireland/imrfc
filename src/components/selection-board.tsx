"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import type { Board, BoardCandidate, Naming, Pitch, ShirtView } from "@/features/selection";
// The Shirt rules are plain TypeScript, so the picker can sort without a round trip.
import { sortForShirt } from "@/features/selection/shirts";
import { BottomSheet } from "@/components/bottom-sheet";
import { NameTheTeam, type NamingActions } from "@/components/name-the-team";

type Result = { ok: true; movedFrom?: string } | { ok: false; error: string };
type Ref = { eventId: string; shirt: number };

type Actions = {
  pick: (eventId: string, shirt: number, userId: string) => Promise<Result>;
  guest: (eventId: string, shirt: number, name: string) => Promise<Result>;
  clear: (eventId: string, shirt: number) => Promise<Result>;
  swap: (from: Ref, to: Ref) => Promise<Result>;
  add: (eventId: string) => Promise<Result>;
  remove: (eventId: string) => Promise<Result>;
};

const POLL_MS = 5000;
const key = (r: Ref) => `${r.eventId}:${r.shirt}`;

/**
 * The shared Selection board: a pitch per Match that day. Tap a Shirt to pick, Swap to
 * trade two Shirts, drag on wider screens. Saves per Shirt and refreshes every few seconds.
 */
export function SelectionBoard({
  board,
  namings,
  openEventId,
  meName,
  actions,
  namingActions,
}: {
  board: Board;
  namings: Record<string, Naming | null>;
  openEventId: string;
  meName: string;
  actions: Actions;
  namingActions: NamingActions;
}) {
  const router = useRouter();
  const [active, setActive] = useState(openEventId);
  const [picking, setPicking] = useState<Ref | null>(null);
  const [swapping, setSwapping] = useState<Ref | null>(null);
  const [flashes, setFlashes] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // Everyone's board stays fresh without a realtime service (ADR 0005); idle tabs don't poll.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  // A Shirt someone else changed since the last refresh flashes "Tom moved this".
  const [lastBoard, setLastBoard] = useState(board);
  if (board !== lastBoard) {
    setLastBoard(board);
    const before = new Map(lastBoard.pitches.flatMap((p) => p.shirts.map((s) => [key({ eventId: p.eventId, shirt: s.shirt }), s.changedAt ? new Date(s.changedAt).getTime() : 0] as const)));
    const fresh: Record<string, string> = {};
    for (const p of board.pitches) {
      for (const s of p.shirts) {
        const k = key({ eventId: p.eventId, shirt: s.shirt });
        const at = s.changedAt ? new Date(s.changedAt).getTime() : 0;
        if (at !== (before.get(k) ?? 0) && s.changedBy && s.changedBy !== meName) fresh[k] = `${s.changedBy.split(" ")[0]} moved this`;
      }
    }
    if (Object.keys(fresh).length > 0) setFlashes((f) => ({ ...f, ...fresh }));
  }
  useEffect(() => {
    if (Object.keys(flashes).length === 0) return;
    const timer = setTimeout(() => setFlashes({}), 4000);
    return () => clearTimeout(timer);
  }, [flashes]);

  function run(action: Promise<Result>, success?: (r: Extract<Result, { ok: true }>) => string | null) {
    startTransition(async () => {
      const result = await action;
      if (!result.ok) return void toast.error(result.error);
      const message = success?.(result);
      if (message) toast.success(message);
      router.refresh();
    });
  }

  function tap(pitch: Pitch, shirt: ShirtView) {
    if (pitch.readOnly) return;
    const ref = { eventId: pitch.eventId, shirt: shirt.shirt };
    if (swapping) {
      const from = swapping;
      setSwapping(null);
      if (key(from) !== key(ref)) run(actions.swap(from, ref));
      return;
    }
    setPicking(ref);
  }

  const pitchByEvent = new Map(board.pitches.map((p) => [p.eventId, p]));
  const pickingShirt = picking ? pitchByEvent.get(picking.eventId)?.shirts.find((s) => s.shirt === picking.shirt) : undefined;
  const pickedElsewhere = new Map<string, string>();
  for (const p of board.pitches) for (const s of p.shirts) if (s.occupant?.kind === "player") pickedElsewhere.set(s.occupant.userId, `${p.label} ${s.shirt}`);

  return (
    <div className="flex flex-col gap-3">
      {board.pitches.length > 1 && (
        <div role="tablist" className="flex gap-1 rounded-2xl bg-muted p-1 lg:hidden">
          {board.pitches.map((p) => (
            <button
              key={p.eventId}
              role="tab"
              aria-selected={p.eventId === active}
              onClick={() => setActive(p.eventId)}
              className={cn("flex-1 rounded-xl px-3 py-2 text-sm font-semibold", p.eventId === active && "bg-card shadow-card")}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {swapping && (
        <p role="status" className="flex items-center justify-between rounded-2xl bg-muted px-4 py-2 text-sm">
          Tap the shirt to swap with.
          <button type="button" onClick={() => setSwapping(null)} className="font-semibold underline">
            Cancel
          </button>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {board.pitches.map((pitch) => (
          <section
            key={pitch.eventId}
            aria-label={`${pitch.label} pitch`}
            className={cn("flex flex-col gap-2", pitch.eventId !== active && "hidden lg:flex")}
          >
            <h2 className="font-heading text-[24px] leading-none">{pitch.label}</h2>
            {pitch.readOnly && <p className="text-xs text-muted-foreground">This match has started or is cancelled, so the team can&apos;t change.</p>}
            {namings[pitch.eventId] && <NameTheTeam eventId={pitch.eventId} label={pitch.label} naming={namings[pitch.eventId]!} actions={namingActions} />}
            <ul className="flex flex-col gap-1.5">
              {pitch.shirts.map((s, i) => (
                <li key={s.shirt}>
                  {s.shirt === 16 && <p className="px-1 pt-2 pb-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Bench</p>}
                  <ShirtRow
                    pitch={pitch}
                    shirt={s}
                    flash={flashes[key({ eventId: pitch.eventId, shirt: s.shirt })]}
                    swapping={!!swapping && key(swapping) === key({ eventId: pitch.eventId, shirt: s.shirt })}
                    onTap={() => tap(pitch, s)}
                    onSwap={() => setSwapping({ eventId: pitch.eventId, shirt: s.shirt })}
                    onDrop={(from) => run(actions.swap(from, { eventId: pitch.eventId, shirt: s.shirt }))}
                  />
                  {i === pitch.shirts.length - 1 && !pitch.readOnly && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(actions.add(pitch.eventId))}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-sm font-semibold"
                      >
                        <Plus className="size-4" aria-hidden="true" /> Add a shirt
                      </button>
                      {pitch.shirts.length > 23 && !s.occupant && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(actions.remove(pitch.eventId))}
                          className="h-10 rounded-2xl border border-border px-4 text-sm font-semibold"
                        >
                          Remove {s.shirt}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {picking && pickingShirt && (
        <PickSheet
          shirt={pickingShirt}
          candidates={board.candidates}
          pickedElsewhere={pickedElsewhere}
          onClose={() => setPicking(null)}
          onPick={(userId) => {
            setPicking(null);
            run(actions.pick(picking.eventId, picking.shirt, userId), (r) => (r.movedFrom ? `Moved from ${r.movedFrom}` : null));
          }}
          onGuest={(name) => {
            setPicking(null);
            run(actions.guest(picking.eventId, picking.shirt, name));
          }}
          onClear={() => {
            setPicking(null);
            run(actions.clear(picking.eventId, picking.shirt));
          }}
        />
      )}
    </div>
  );
}

const availabilityLabel = { available: "Available", not_available: "Not available", no_reply: "No reply" } as const;

function ShirtRow({
  pitch,
  shirt,
  flash,
  swapping,
  onTap,
  onSwap,
  onDrop,
}: {
  pitch: Pitch;
  shirt: ShirtView;
  flash?: string;
  swapping: boolean;
  onTap: () => void;
  onSwap: () => void;
  onDrop: (from: Ref) => void;
}) {
  const o = shirt.occupant;
  const ref = { eventId: pitch.eventId, shirt: shirt.shirt };
  const name = o?.name;
  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        disabled={pitch.readOnly && !o}
        onClick={onTap}
        draggable={!!o && !pitch.readOnly}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify(ref))}
        onDragOver={(e) => !pitch.readOnly && e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData("text/plain");
          if (!raw || pitch.readOnly) return;
          const from = JSON.parse(raw) as Ref;
          if (from.eventId !== ref.eventId || from.shirt !== ref.shirt) onDrop(from);
        }}
        aria-label={`Shirt ${shirt.shirt}${shirt.position ? `, ${shirt.position}` : ""}${name ? `, ${name}` : ", empty"}`}
        className={cn(
          "flex min-h-12 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left transition-transform active:scale-[0.99]",
          !o && "border border-dashed border-border text-muted-foreground",
          o?.kind === "guest" && "bg-muted",
          o?.kind === "player" && o.availability === "available" && "bg-primary text-primary-foreground",
          o?.kind === "player" && o.availability === "no_reply" && "border border-dashed border-foreground/60 bg-card",
          o?.kind === "player" && o.availability === "not_available" && "bg-destructive/10 text-destructive-text",
          swapping && "ring-2 ring-ring",
          flash && "animate-pulse ring-2 ring-ring",
        )}
      >
        <span className="w-6 text-center font-heading text-xl leading-none">{shirt.shirt}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-semibold", o?.kind === "player" && o.availability === "not_available" && "line-through")}>
            {name ?? shirt.position ?? "Empty"}
          </span>
          <span className="truncate text-xs opacity-80">
            {o?.kind === "player" && availabilityLabel[o.availability]}
            {o?.kind === "guest" && "Guest"}
            {o && shirt.position && ` · ${shirt.position}`}
            {flash && ` · ${flash}`}
          </span>
        </span>
        {o?.kind === "player" && o.fit === "rest" && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">Out of position</span>
        )}
      </button>
      {o && !pitch.readOnly && (
        <button type="button" onClick={onSwap} aria-label={`Swap shirt ${shirt.shirt}`} className="rounded-2xl border border-border px-3">
          <ArrowLeftRight className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const fitHeading = { preferred: "Preferred position", other: "Other positions", cover: "Could cover", rest: "Everyone else", bench: "Everyone" } as const;

function PickSheet({
  shirt,
  candidates,
  pickedElsewhere,
  onClose,
  onPick,
  onGuest,
  onClear,
}: {
  shirt: ShirtView;
  candidates: BoardCandidate[];
  pickedElsewhere: Map<string, string>;
  onClose: () => void;
  onPick: (userId: string) => void;
  onGuest: (name: string) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = useState("");
  const [guest, setGuest] = useState("");
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const term = search.trim().toLowerCase();
  const sorted = sortForShirt(shirt.shirt, candidates).filter((s) => !term || s.candidate.name.toLowerCase().includes(term));
  const groups = (["preferred", "other", "cover", "rest", "bench"] as const)
    .map((fit) => ({ fit, rows: sorted.filter((s) => s.fit === fit) }))
    .filter((g) => g.rows.length > 0);

  return (
    <BottomSheet eyebrow={`Shirt ${shirt.shirt}`} title={shirt.position ?? "Bench"} onSubmit={(e) => e.preventDefault()} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          aria-label="Search by name"
          className="h-11 rounded-2xl border border-input bg-card px-4 text-sm"
        />
        {shirt.occupant && (
          <button type="button" onClick={onClear} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold">
            <X className="size-4" aria-hidden="true" /> Empty this shirt
          </button>
        )}
        {groups.map((g) => (
          <div key={g.fit} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{fitHeading[g.fit]}</p>
            <ul className="flex flex-col gap-1">
              {g.rows.map(({ candidate }) => {
                const c = byId.get(candidate.id)!;
                const elsewhere = pickedElsewhere.get(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => onPick(c.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-left"
                    >
                      <span className="flex flex-col">
                        <span className="font-semibold">{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.preferredPosition ?? "No position set"}
                          {elsewhere && ` · on ${elsewhere}`}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          c.availability === "available" && "bg-primary text-primary-foreground",
                          c.availability === "not_available" && "bg-destructive/10 text-destructive-text line-through",
                          c.availability === "no_reply" && "border border-dashed border-foreground/60",
                        )}
                      >
                        {availabilityLabel[c.availability]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={guest}
            onChange={(e) => setGuest(e.target.value)}
            placeholder="Someone not on the app"
            aria-label="Guest's name"
            className="h-11 min-w-0 flex-1 rounded-2xl border border-input bg-card px-4 text-sm"
          />
          <button
            type="button"
            disabled={!guest.trim()}
            onClick={() => onGuest(guest)}
            className="h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Add guest
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
