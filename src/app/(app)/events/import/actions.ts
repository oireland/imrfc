"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { createEvents, listTeams, readEventsCsv } from "@/features/events";
import { isCommitteeOrAbove } from "@/features/users";
import { requireApprovedUser } from "@/lib/session";

export type ImportState = { ok: true; count: number } | { ok: false; errors: string[] } | null;

/** Creates every Event in an uploaded CSV, or none if any row has a problem. Committee and above only. */
export async function importEvents(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireApprovedUser();
  if (!isCommitteeOrAbove(user.role)) return { ok: false, errors: ["Only committee can add events."] };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: ["Choose a CSV file to import."] };

  const read = readEventsCsv(await file.text(), { teams: await listTeams(db) });
  if (!read.ok) return read;

  const created = await createEvents(db, read.events);
  if (!created.ok) return { ok: false, errors: [created.error] };
  revalidatePath("/");
  revalidatePath("/events");
  return { ok: true, count: created.count };
}
