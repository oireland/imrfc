import type { Board, Occupant, Role } from "./index";
import { fitFor } from "./shirts";
import { SINGLE_ROLES } from "./sheet";

type Ref = { eventId: string; shirt: number };

export type OptimisticChange =
  | ({ type: "pick"; userId: string } & Ref)
  | ({ type: "guest"; name: string } & Ref)
  | ({ type: "clear" } & Ref)
  | ({ type: "roles"; roles: Role[] } & Ref)
  | { type: "swap"; from: Ref; to: Ref };

type Slot = { occupant: Occupant | null; roles: Role[] };

/** What the board will look like once a change is saved, so the screen can show it before the server answers. */
export function applyOptimistic(board: Board, change: OptimisticChange): Board {
  const shirtAt = (ref: Ref) => board.pitches.find((p) => p.eventId === ref.eventId)?.shirts.find((s) => s.shirt === ref.shirt);

  const next = new Map<string, Slot>();
  // A Shirt that changes hands starts with no roles, as on the server.
  const put = (ref: Ref, occupant: Occupant | null, roles: Role[] = []) => next.set(`${ref.eventId}:${ref.shirt}`, { occupant, roles });

  if (change.type === "pick") {
    const candidate = board.candidates.find((c) => c.id === change.userId);
    if (!candidate) return board;
    // A Player holds one Shirt per day, so picking them elsewhere moves them.
    for (const p of board.pitches) for (const s of p.shirts) if (s.occupant?.kind === "player" && s.occupant.userId === change.userId) put({ eventId: p.eventId, shirt: s.shirt }, null);
    put(change, { kind: "player", userId: candidate.id, name: candidate.name, fit: fitFor(change.shirt, candidate), availability: candidate.availability });
  } else if (change.type === "guest") {
    put(change, { kind: "guest", name: change.name.trim() });
  } else if (change.type === "clear") {
    put(change, null);
  } else if (change.type === "roles") {
    const here = shirtAt(change);
    if (!here?.occupant) return board;
    // C and VC are held by one person, so they move off whoever had them.
    const single = change.roles.filter((r) => SINGLE_ROLES.includes(r));
    for (const s of board.pitches.find((p) => p.eventId === change.eventId)?.shirts ?? []) {
      if (s.shirt !== change.shirt && s.roles.some((r) => single.includes(r))) put({ eventId: change.eventId, shirt: s.shirt }, s.occupant, s.roles.filter((r) => !single.includes(r)));
    }
    put(change, here.occupant, change.roles);
  } else {
    const [a, b] = [shirtAt(change.from), shirtAt(change.to)];
    const refit = (o: Occupant | null, ref: Ref) => {
      if (o?.kind !== "player") return o;
      const candidate = board.candidates.find((c) => c.id === o.userId);
      return candidate ? { ...o, fit: fitFor(ref.shirt, candidate) } : o;
    };
    // Roles travel with the person.
    put(change.from, refit(b?.occupant ?? null, change.from), b?.roles);
    put(change.to, refit(a?.occupant ?? null, change.to), a?.roles);
  }

  return {
    ...board,
    pitches: board.pitches.map((p) => ({
      ...p,
      shirts: p.shirts.map((s) => {
        const k = `${p.eventId}:${s.shirt}`;
        return next.has(k) ? { ...s, ...next.get(k)! } : s;
      }),
    })),
  };
}
