"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { addShirt, clearShirt, pickGuest, pickPlayer, removeShirt, swapShirts } from "@/features/selection";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

type Ref = { eventId: string; shirt: number };

// Each Shirt saves on its own; the open boards then refresh within a few seconds (ADR 0005).
async function changed<T>(eventIds: string[], run: (viewer: { id: string; committee: boolean }) => Promise<T>): Promise<T> {
  const current = await requireApprovedUser();
  const result = await run({ id: current.id, committee: isCommitteeOrAbove(current.role) });
  for (const id of eventIds) revalidatePath(`/events/${id}/selection`);
  return result;
}

export async function pick(eventId: string, shirt: number, userId: string) {
  return changed([eventId], (viewer) => pickPlayer(db, { eventId, shirt, userId, viewer }));
}

export async function guest(eventId: string, shirt: number, name: string) {
  return changed([eventId], (viewer) => pickGuest(db, { eventId, shirt, name, viewer }));
}

export async function clear(eventId: string, shirt: number) {
  return changed([eventId], (viewer) => clearShirt(db, { eventId, shirt, viewer }));
}

export async function swap(from: Ref, to: Ref) {
  return changed([from.eventId, to.eventId], (viewer) => swapShirts(db, { from, to, viewer }));
}

export async function add(eventId: string) {
  return changed([eventId], (viewer) => addShirt(db, { eventId, viewer }));
}

export async function remove(eventId: string) {
  return changed([eventId], (viewer) => removeShirt(db, { eventId, viewer }));
}
