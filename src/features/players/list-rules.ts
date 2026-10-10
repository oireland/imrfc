import { RUGBY_POSITIONS, type RugbyPosition } from "@/features/users";

export type PlayerRow = {
  id: string;
  name: string;
  preferredPosition: RugbyPosition | null;
  playing: boolean;
  /** Away today. */
  away: boolean;
  /** "Away until 3 Nov" / "Away from 20 Dec", or null with none current or coming. */
  awayLabel: string | null;
  /** Worst open Injury Status, or null when Fit. Supplied by the `injuries` feature. */
  fitness: "out" | "training_only" | "playing_through" | null;
  /** "Out · ankle (+1)". */
  injuryLine: string | null;
  /** A prompt to check in on a quiet Injury. */
  checkIn: string | null;
  /** An Injury or Away added or changed in the last 48 hours. */
  isNew: boolean;
};

export type PlayerListing = {
  playing: PlayerRow[];
  notPlaying: PlayerRow[];
};

const positionOrder = (position: RugbyPosition | null) =>
  position ? RUGBY_POSITIONS.indexOf(position) : RUGBY_POSITIONS.length;

/**
 * Players in Position order (by Preferred Position, undecided last), split into Playing
 * and Not playing, narrowed to a name search and, optionally, to those Injured and/or Away now or coming up.
 */
export function listPlayers(
  players: PlayerRow[],
  search = "",
  filters: { awayOnly?: boolean; injuredOnly?: boolean } = {},
): PlayerListing {
  const term = search.trim().toLowerCase();
  const named = term ? players.filter((p) => p.name.toLowerCase().includes(term)) : players;
  const narrowed = filters.awayOnly || filters.injuredOnly;
  const matching = narrowed ? named.filter((p) => (filters.awayOnly && p.awayLabel) || (filters.injuredOnly && p.fitness)) : named;
  const sorted = [...matching].sort(
    (a, b) => positionOrder(a.preferredPosition) - positionOrder(b.preferredPosition) || a.name.localeCompare(b.name),
  );
  return {
    playing: sorted.filter((p) => p.playing),
    notPlaying: sorted.filter((p) => !p.playing),
  };
}

/** The line under the title ("3 out · 1 training only · 2 playing through it · 2 away"): Playing Players, non-zero parts only. */
export function summarizePlayers(players: PlayerRow[]): string {
  const playing = players.filter((p) => p.playing);
  const count = (fitness: PlayerRow["fitness"]) => playing.filter((p) => p.fitness === fitness).length;
  const parts: [number, string][] = [
    [count("out"), "out"],
    [count("training_only"), "training only"],
    [count("playing_through"), "playing through it"],
    [playing.filter((p) => p.away).length, "away"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(" · ");
}
