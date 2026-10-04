"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "cn";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import type { Board, BoardCandidate, Naming, Pitch, Role, SheetLayout, ShirtView } from "@/features/selection";
// The Shirt rules are plain TypeScript, so the picker can sort without a round trip.
import { sortForShirt, STARTING_SHIRTS } from "@/features/selection/shirts";
import { ROLES, ROLE_NAMES, rolesText } from "@/features/selection/sheet";
import { applyOptimistic, type OptimisticChange } from "@/features/selection/optimistic";
import { BottomSheet } from "@/components/bottom-sheet";
import { NameTheTeam, type NamingActions } from "@/components/name-the-team";
import { TeamSheetDialog } from "@/components/team-sheet-dialog";

type Result = { ok: true; movedFrom?: string } | { ok: false; error: string };
type Ref = { eventId: string; shirt: number };

type Actions = {
  pick: (eventId: string, shirt: number, userId: string) => Promise<Result>;
  guest: (eventId: string, shirt: number, name: string) => Promise<Result>;
  clear: (eventId: string, shirt: number) => Promise<Result>;
  swap: (from: Ref, to: Ref) => Promise<Result>;
  roles: (eventId: string, shirt: number, roles: Role[]) => Promise<Result>;
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
  layouts,
  openEventId,
  meName,
  actions,
  namingActions,
}: {
  board: Board;
  namings: Record<string, Naming | null>;
  layouts: Record<string, SheetLayout | null>;
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
  // Shown straight away; it falls back to the real board once the save lands (or fails).
  const [shown, addOptimistic] = useOptimistic(board, applyOptimistic);

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

  // The server actions revalidate the page, so the fresh board arrives with the response.
  function run(save: () => Promise<Result>, options: { change?: OptimisticChange; success?: (r: Extract<Result, { ok: true }>) => string | null } = {}) {
    startTransition(async () => {
      if (options.change) addOptimistic(options.change);
      const result = await save();
      if (!result.ok) return void toast.error(result.error);
      const message = options.success?.(result);
      if (message) toast.success(message);
    });
  }

  function tap(pitch: Pitch, shirt: ShirtView) {
    if (pitch.readOnly) return;
    const ref = { eventId: pitch.eventId, shirt: shirt.shirt };
    if (swapping) {
      const from = swapping;
      setSwapping(null);
      if (key(from) !== key(ref)) run(() => actions.swap(from, ref), { change: { type: "swap", from, to: ref } });
      return;
    }
    setPicking(ref);
  }

  const pitchByEvent = new Map(shown.pitches.map((p) => [p.eventId, p]));
  const pickingShirt = picking ? pitchByEvent.get(picking.eventId)?.shirts.find((s) => s.shirt === picking.shirt) : undefined;
  const pickedElsewhere = new Map<string, string>();
  for (const p of shown.pitches) for (const s of p.shirts) if (s.occupant?.kind === "player") pickedElsewhere.set(s.occupant.userId, `${p.label} ${s.shirt}`);

  function dropOn(pitch: Pitch, shirt: ShirtView, from: Ref) {
    const to = { eventId: pitch.eventId, shirt: shirt.shirt };
    run(() => actions.swap(from, to), { change: { type: "swap", from, to } });
  }

  function tileProps(pitch: Pitch, shirt: ShirtView) {
    const ref = { eventId: pitch.eventId, shirt: shirt.shirt };
    return {
      pitch,
      shirt,
      flash: flashes[key(ref)],
      swapping: !!swapping && key(swapping) === key(ref),
      onTap: () => tap(pitch, shirt),
      onDrop: (from: Ref) => dropOn(pitch, shirt, from),
    };
  }

  return (
    <div className="flex flex-col gap-3">
      {shown.pitches.length > 1 && (
        <div role="tablist" className="flex gap-1 rounded-2xl bg-muted p-1">
          {shown.pitches.map((p) => (
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
      <div className="mx-auto w-full max-w-md">
        {shown.pitches.filter((p) => p.eventId === active || shown.pitches.length === 1).map((pitch) => (
          <section key={pitch.eventId} aria-label={`${pitch.label} pitch`} className="flex flex-col gap-3">
            <h2 className="font-heading text-[24px] leading-none">{pitch.label}</h2>
            {pitch.readOnly && <p className="text-xs text-muted-foreground">This match has started or is cancelled, so the team can&apos;t change.</p>}
            {namings[pitch.eventId] && (
              <NameTheTeam
                eventId={pitch.eventId}
                label={pitch.label}
                naming={namings[pitch.eventId]!}
                actions={namingActions}
                sheet={layouts[pitch.eventId] && <TeamSheetDialog eventId={pitch.eventId} layout={layouts[pitch.eventId]!} />}
              />
            )}
            <div className="flex flex-col gap-6 rounded-3xl bg-lead px-3 py-5 text-lead-foreground shadow-card">
              {PITCH_ROWS.map((row) => (
                <div key={row.join("-")} className={cn("grid", row.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                  {row.map((n) => {
                    const s = pitch.shirts.find((x) => x.shirt === n);
                    return s && <ShirtTile key={n} {...tileProps(pitch, s)} />;
                  })}
                </div>
              ))}
            </div>

            <p className="px-1 pt-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Subs</p>
            <ul className="grid grid-cols-2 gap-1.5">
              {pitch.shirts
                .filter((s) => s.shirt > STARTING_SHIRTS)
                .map((s) => (
                  <li key={s.shirt}>
                    <ShirtRow
                      pitch={pitch}
                      shirt={s}
                      flash={flashes[key({ eventId: pitch.eventId, shirt: s.shirt })]}
                      swapping={!!swapping && key(swapping) === key({ eventId: pitch.eventId, shirt: s.shirt })}
                      onTap={() => tap(pitch, s)}
                      onSwap={() => setSwapping({ eventId: pitch.eventId, shirt: s.shirt })}
                      onDrop={(from) => dropOn(pitch, s, from)}
                    />
                  </li>
                ))}
            </ul>
            {!pitch.readOnly && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => actions.add(pitch.eventId))}
                  className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-sm font-semibold"
                >
                  <Plus className="size-4" aria-hidden="true" /> Add a shirt
                </button>
                {pitch.shirts.length > 23 && !pitch.shirts[pitch.shirts.length - 1].occupant && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => actions.remove(pitch.eventId))}
                    className="h-10 rounded-2xl border border-border px-4 text-sm font-semibold"
                  >
                    Remove {pitch.shirts[pitch.shirts.length - 1].shirt}
                  </button>
                )}
              </div>
            )}
          </section>
        ))}
      </div>

      {picking && pickingShirt && (
        <PickSheet
          shirt={pickingShirt}
          candidates={shown.candidates}
          pickedElsewhere={pickedElsewhere}
          onClose={() => setPicking(null)}
          onPick={(userId) =>
            run(() => actions.pick(picking.eventId, picking.shirt, userId), {
              change: { type: "pick", ...picking, userId },
              success: (r) => (r.movedFrom ? `Moved from ${r.movedFrom}` : null),
            })
          }
          onGuest={(name) => run(() => actions.guest(picking.eventId, picking.shirt, name), { change: { type: "guest", ...picking, name } })}
          onClear={() => run(() => actions.clear(picking.eventId, picking.shirt), { change: { type: "clear", ...picking } })}
          onSwap={() => {
            setSwapping(picking);
            setPicking(null);
          }}
          onRoles={(next) => run(() => actions.roles(picking.eventId, picking.shirt, next), { change: { type: "roles", ...picking, roles: next } })}
        />
      )}
    </div>
  );
}

// The fifteen starting Shirts as they stand on a pitch, front row at the top to the back three at the bottom.
const PITCH_ROWS = [[1, 2, 3], [4, 5], [6, 8, 7], [9, 10], [13, 12], [11, 15, 14]];

/** "Tom Hale" on a pitch label becomes "T. Hale"; one-word names stay as they are. */
function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length > 0 ? `${first[0]}. ${rest.join(" ")}` : first;
}

function ShirtTile({
  pitch,
  shirt,
  flash,
  swapping,
  onTap,
  onDrop,
}: {
  pitch: Pitch;
  shirt: ShirtView;
  flash?: string;
  swapping: boolean;
  onTap: () => void;
  onDrop: (from: Ref) => void;
}) {
  const o = shirt.occupant;
  const ref = { eventId: pitch.eventId, shirt: shirt.shirt };
  return (
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
      aria-label={`Shirt ${shirt.shirt}${shirt.position ? `, ${shirt.position}` : ""}${o ? `, ${o.name}` : ", empty"}${shirt.roles.length > 0 ? `, ${rolesText(shirt.roles)}` : ""}${o?.kind === "player" && o.fit === "rest" ? ", out of position" : ""}`}
      className={cn("mx-auto flex w-full max-w-[7.5rem] flex-col items-center gap-1 rounded-2xl p-1 active:scale-[0.97]", (swapping || flash) && "ring-2 ring-ring", flash && "animate-pulse")}
    >
      <span className="relative">
        <svg viewBox="0 0 64 56" className="h-12 w-14" aria-hidden="true">
          <path
            d="M20 3 L4 12 L10 26 L16 23 L16 53 L48 53 L48 23 L54 26 L60 12 L44 3 C41 9 23 9 20 3 Z"
            strokeWidth={o ? 0 : 2}
            strokeDasharray={o ? undefined : "4 3"}
            className={cn(
              !o && "fill-transparent stroke-lead-foreground/60",
              o?.kind === "guest" && "fill-muted",
              o?.kind === "player" && o.availability === "available" && "fill-card",
              o?.kind === "player" && o.availability === "no_reply" && "fill-card/30 stroke-card stroke-2",
              o?.kind === "player" && o.availability === "not_available" && "fill-destructive",
            )}
          />
        </svg>
        {shirt.roles.length > 0 && (
          <span className="absolute -top-1 -right-3 rounded-full bg-accent px-1.5 py-0.5 text-[10px] leading-none font-semibold text-accent-foreground">{rolesText(shirt.roles)}</span>
        )}
        {o?.kind === "player" && o.fit === "rest" && (
          <span className="absolute -bottom-0.5 -left-3 rounded-full bg-accent px-1.5 py-0.5 text-[10px] leading-none font-semibold text-accent-foreground" aria-hidden="true">
            Off
          </span>
        )}
      </span>
      <span className="flex w-full overflow-hidden rounded-lg bg-card text-card-foreground shadow-card">
        <span className="bg-primary px-1.5 py-0.5 font-heading text-sm leading-tight text-primary-foreground">{shirt.shirt}</span>
        <span className={cn("min-w-0 flex-1 truncate px-1.5 py-0.5 text-xs font-semibold", !o && "text-muted-foreground", o?.kind === "player" && o.availability === "not_available" && "line-through")}>
          {o ? shortName(o.name) : (shirt.position ?? "Empty")}
        </span>
      </span>
    </button>
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
        aria-label={`Shirt ${shirt.shirt}${shirt.position ? `, ${shirt.position}` : ""}${name ? `, ${name}` : ", empty"}${shirt.roles.length > 0 ? `, ${rolesText(shirt.roles)}` : ""}`}
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
            {shirt.roles.length > 0 && ` · ${rolesText(shirt.roles)}`}
            {flash && ` · ${flash}`}
          </span>
        </span>
        {o?.kind === "player" && o.fit === "rest" && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">Out of position</span>
        )}
      </button>
      {o && !pitch.readOnly && (
        <>
          <button type="button" onClick={onSwap} aria-label={`Swap shirt ${shirt.shirt}`} className="rounded-2xl border border-border px-3">
            <ArrowLeftRight className="size-4" aria-hidden="true" />
          </button>
        </>
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
  onSwap,
  onRoles,
}: {
  shirt: ShirtView;
  candidates: BoardCandidate[];
  pickedElsewhere: Map<string, string>;
  onClose: () => void;
  onPick: (userId: string) => void;
  onGuest: (name: string) => void;
  onClear: () => void;
  onSwap: () => void;
  onRoles: (roles: Role[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [guest, setGuest] = useState("");
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const term = search.trim().toLowerCase();
  const current = shirt.occupant;
  const currentId = current?.kind === "player" ? current.userId : null;
  const sorted = sortForShirt(shirt.shirt, candidates).filter((s) => s.candidate.id !== currentId && (!term || s.candidate.name.toLowerCase().includes(term)));
  // Players already on a Shirt that day sit in a section of their own, below everyone still free.
  const free = sorted.filter((s) => !pickedElsewhere.has(s.candidate.id));
  const groups = [
    ...(["preferred", "other", "cover", "rest", "bench"] as const).map((fit) => ({ key: fit, heading: fitHeading[fit], rows: free.filter((s) => s.fit === fit) })),
    { key: "picked", heading: "Already picked", rows: sorted.filter((s) => pickedElsewhere.has(s.candidate.id)) },
  ].filter((g) => g.rows.length > 0);

  // Picking stays on this sheet, so roles can follow straight away; Done closes it.
  return (
    <BottomSheet
      eyebrow={`Shirt ${shirt.shirt}`}
      title={shirt.position ?? "Bench"}
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {current && (
          <section aria-label="Selected" className="flex flex-col gap-3 rounded-2xl bg-muted p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Selected</span>
                <span className="truncate font-semibold">{current.name}</span>
                <span className="text-xs text-muted-foreground">{current.kind === "guest" ? "Guest" : availabilityLabel[current.availability]}</span>
              </div>
              <div className="flex gap-1.5">
                <button type="button" onClick={onSwap} className="flex h-10 items-center gap-1.5 rounded-2xl border border-border bg-card px-3 text-sm font-semibold">
                  <ArrowLeftRight className="size-4" aria-hidden="true" /> Swap
                </button>
                <button type="button" onClick={onClear} className="flex h-10 items-center gap-1.5 rounded-2xl border border-border bg-card px-3 text-sm font-semibold">
                  <X className="size-4" aria-hidden="true" /> Empty
                </button>
              </div>
            </div>
            <div role="group" aria-label="Match day roles" className="flex flex-wrap gap-1.5">
              {ROLES.map((role) => {
                const on = shirt.roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={on}
                    title={ROLE_NAMES[role]}
                    aria-label={ROLE_NAMES[role]}
                    onClick={() => onRoles(on ? shirt.roles.filter((r) => r !== role) : [...shirt.roles, role])}
                    className={cn("h-9 min-w-11 rounded-full px-3 text-sm font-semibold", on ? "bg-primary text-primary-foreground" : "border border-border bg-card")}
                  >
                    {role}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="Search by name"
          aria-label="Search by name"
          className="h-11 rounded-2xl border border-input bg-card px-4 text-sm"
        />
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{g.heading}</p>
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
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder="Someone not on the app"
            aria-label="Guest's name"
            className="h-11 min-w-0 flex-1 rounded-2xl border border-input bg-card px-4 text-sm"
          />
          <button
            type="button"
            disabled={!guest.trim()}
            onClick={() => {
              onGuest(guest);
              setGuest("");
            }}
            className="h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Add guest
          </button>
        </div>
        <button type="submit" className="h-12 rounded-2xl bg-primary text-base font-semibold text-primary-foreground">
          Done
        </button>
      </div>
    </BottomSheet>
  );
}
