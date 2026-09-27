// Default source selection for Confirming a To Duty when a Kit Unit's Whereabouts is
// split across several Places. Pure, no database. Slice 18 lets the confirm sheet ask
// instead; for now this picks a sensible default: the Duty's own User's Portion first,
// then Home, then another Store, then another Holder.
import type { Place, Portion } from "@/features/kit";

export function defaultConfirmSource(
  portions: Portion[],
  { dutyUserId, homeStoreId }: { dutyUserId: string; homeStoreId: string },
): Place | undefined {
  const available = portions.filter((p) => p.count > 0);

  const own = available.find((p) => p.whereaboutsType === "holder" && p.holderId === dutyUserId);
  if (own) return { type: "holder", holderId: dutyUserId };

  const home = available.find((p) => p.whereaboutsType === "store" && p.storeId === homeStoreId);
  if (home) return { type: "store", storeId: homeStoreId };

  const otherStore = available.find((p) => p.whereaboutsType === "store");
  if (otherStore) return { type: "store", storeId: otherStore.storeId! };

  const otherHolder = available.find((p) => p.whereaboutsType === "holder");
  if (otherHolder) return { type: "holder", holderId: otherHolder.holderId! };

  return undefined;
}
