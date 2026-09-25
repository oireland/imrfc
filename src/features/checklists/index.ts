import { and, eq } from "drizzle-orm";
import { getKitUnit } from "@/features/kit";
import { checklist, checklistItem } from "./schema";
import { resolveChecklist, type ResolvedChecklist } from "./rules";

export { resolveChecklist } from "./rules";
export type { ResolvedChecklist } from "./rules";
export { checklist, checklistItem } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ChecklistScope = { scope: "event_type" | "series" | "event"; scopeId: string };

async function findChecklistId(db: Db, { scope, scopeId }: ChecklistScope): Promise<string | undefined> {
  const [row] = await db
    .select({ id: checklist.id })
    .from(checklist)
    .where(and(eq(checklist.scope, scope), eq(checklist.scopeId, scopeId)));
  return row?.id;
}

/** Kit Unit ids on this level's own Checklist, or undefined if the level has none. */
export async function getChecklist(db: Db, target: ChecklistScope): Promise<string[] | undefined> {
  const id = await findChecklistId(db, target);
  if (!id) return undefined;
  const rows = await db
    .select({ kitUnitId: checklistItem.kitUnitId })
    .from(checklistItem)
    .where(eq(checklistItem.checklistId, id));
  return rows.map((r: { kitUnitId: string }) => r.kitUnitId);
}

export async function addToChecklist(
  db: Db,
  target: ChecklistScope,
  kitUnitId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unit = await getKitUnit(db, kitUnitId);
  if (!unit || unit.status !== "active") {
    return { ok: false, error: "Missing or retired kit can't go on the list." };
  }
  let id = await findChecklistId(db, target);
  if (!id) {
    id = crypto.randomUUID() as string;
    await db.insert(checklist).values({ id, ...target });
  }
  await db
    .insert(checklistItem)
    .values({ id: crypto.randomUUID(), checklistId: id, kitUnitId })
    .onConflictDoNothing();
  return { ok: true };
}

export async function removeFromChecklist(db: Db, target: ChecklistScope, kitUnitId: string) {
  const id = await findChecklistId(db, target);
  if (!id) return;
  await db
    .delete(checklistItem)
    .where(and(eq(checklistItem.checklistId, id), eq(checklistItem.kitUnitId, kitUnitId)));
}

/** Drops this level's own Checklist so the Event falls back to the next level. */
export async function clearChecklist(db: Db, target: ChecklistScope) {
  const id = await findChecklistId(db, target);
  if (!id) return;
  await db.delete(checklistItem).where(eq(checklistItem.checklistId, id));
  await db.delete(checklist).where(eq(checklist.id, id));
}

export async function resolveEventChecklist(
  db: Db,
  event: { eventId: string; seriesId: string | null; eventType: string },
): Promise<ResolvedChecklist> {
  return resolveChecklist({
    event: await getChecklist(db, { scope: "event", scopeId: event.eventId }),
    series: event.seriesId
      ? await getChecklist(db, { scope: "series", scopeId: event.seriesId })
      : undefined,
    default: await getChecklist(db, { scope: "event_type", scopeId: event.eventType }),
  });
}
