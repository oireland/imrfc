import { listDutyRecordForUser } from "@/features/duties";
import { displayName, listApprovedUsers, setPlaying, setPositions, type RugbyPosition } from "@/features/users";
import { listPlayers as listPlayersRules, type PlayerListing, type PlayerRow } from "./list-rules";
import { normalizePositions } from "./positions-rules";

export { setPlaying, setPositions };
export { normalizePositions } from "./positions-rules";
export type { PlayerListing, PlayerRow } from "./list-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Player = {
  id: string;
  name: string;
  preferredPosition: RugbyPosition | null;
  otherPositions: RugbyPosition[];
  playing: boolean;
};

/** Every approved User as a Player, Position-ordered and split into Playing / Not playing. */
export async function listPlayers(db: Db, search = ""): Promise<PlayerListing> {
  const users = await listApprovedUsers(db);
  const rows: PlayerRow[] = users.map((u) => ({
    id: u.id,
    name: displayName(u),
    preferredPosition: u.preferredPosition as RugbyPosition | null,
    playing: u.playing,
  }));
  return listPlayersRules(rows, search);
}

/** One Player, with their Positions and duty record, for the Player page. */
export async function getPlayer(db: Db, id: string): Promise<(Player & { dutyRecord: Awaited<ReturnType<typeof listDutyRecordForUser>> }) | undefined> {
  const users = await listApprovedUsers(db);
  const found = users.find((u) => u.id === id);
  if (!found) return undefined;
  const dutyRecord = await listDutyRecordForUser(db, id);
  return {
    id: found.id,
    name: displayName(found),
    preferredPosition: found.preferredPosition as RugbyPosition | null,
    otherPositions: found.otherPositions as RugbyPosition[],
    playing: found.playing,
    dutyRecord,
  };
}

/** Sets a Player's Positions, deduplicated and never repeating the Preferred one. */
export async function setPlayerPositions(db: Db, userId: string, preferred: RugbyPosition, other: RugbyPosition[]) {
  await setPositions(db, userId, normalizePositions(preferred, other));
}
