import { RUGBY_POSITIONS, type RugbyPosition } from "@/features/users";

export type PlayerRow = {
  id: string;
  name: string;
  preferredPosition: RugbyPosition | null;
  playing: boolean;
};

export type PlayerListing = {
  playing: PlayerRow[];
  notPlaying: PlayerRow[];
};

const positionOrder = (position: RugbyPosition | null) =>
  position ? RUGBY_POSITIONS.indexOf(position) : RUGBY_POSITIONS.length;

/**
 * Players in Position order (by Preferred Position, undecided last), split into Playing
 * and Not playing, narrowed to a name search.
 */
export function listPlayers(players: PlayerRow[], search = ""): PlayerListing {
  const term = search.trim().toLowerCase();
  const matching = term ? players.filter((p) => p.name.toLowerCase().includes(term)) : players;
  const sorted = [...matching].sort(
    (a, b) => positionOrder(a.preferredPosition) - positionOrder(b.preferredPosition) || a.name.localeCompare(b.name),
  );
  return {
    playing: sorted.filter((p) => p.playing),
    notPlaying: sorted.filter((p) => !p.playing),
  };
}
