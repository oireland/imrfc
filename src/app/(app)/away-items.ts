import { rangeLabel, type AwayListing } from "@/features/players";

/** The Away card's props for one Player's time away, with who set each one, unless it was the Player themself. */
export function awayItems(listing: AwayListing, playerId: string) {
  const item = (a: AwayListing["current"][number]) => ({
    id: a.id,
    from: a.from,
    until: a.until,
    range: rangeLabel(a.from, a.until),
    reason: a.reason,
    setBy: a.setById === playerId ? null : `set by ${a.setBy}`,
  });
  return { current: listing.current.map(item), future: listing.future.map(item), past: listing.past.map(item) };
}
