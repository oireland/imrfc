"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { saveTeamSheet, setRoles, type FieldEdit, type FieldKey, type Role } from "@/features/selection";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

async function viewer() {
  const current = await requireApprovedUser();
  return { id: current.id, committee: isCommitteeOrAbove(current.role) };
}

export async function save(eventId: string, fields: Partial<Record<FieldKey, FieldEdit>>) {
  const result = await saveTeamSheet(db, { eventId, viewer: await viewer(), fields });
  revalidatePath(`/events/${eventId}/team-sheet`);
  return result;
}

export async function roles(eventId: string, shirt: number, next: Role[]) {
  const result = await setRoles(db, { eventId, shirt, roles: next, viewer: await viewer() });
  revalidatePath(`/events/${eventId}/team-sheet`);
  return result;
}
