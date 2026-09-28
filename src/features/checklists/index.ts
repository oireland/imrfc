import { and, eq } from "drizzle-orm";
import { getEquipmentUnit, listEquipmentUnitsByIds } from "@/features/equipment";
import { checklist, checklistItem } from "./schema";
import { effectiveCount, resolveChecklist, type ChecklistLine } from "./rules";

export { resolveChecklist, effectiveCount } from "./rules";
export type { ChecklistLine, ResolvedChecklist } from "./rules";
export { checklist, checklistItem } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ChecklistScope = { scope: "event_type" | "series" | "event"; scopeId: string };

/** A Checklist line resolved for an Event: its count is now effective, always a number. */
export type ResolvedChecklistItem = { equipmentUnitId: string; count: number };
export type ResolvedEventChecklist = {
  source: "event" | "series" | "default" | "none";
  items: ResolvedChecklistItem[];
};

async function findChecklistId(db: Db, { scope, scopeId }: ChecklistScope): Promise<string | undefined> {
  const [row] = await db
    .select({ id: checklist.id })
    .from(checklist)
    .where(and(eq(checklist.scope, scope), eq(checklist.scopeId, scopeId)));
  return row?.id;
}

/** This level's own Checklist lines, or undefined if the level has none. */
export async function getChecklist(db: Db, target: ChecklistScope): Promise<ChecklistLine[] | undefined> {
  const id = await findChecklistId(db, target);
  if (!id) return undefined;
  const rows = await db
    .select({ equipmentUnitId: checklistItem.equipmentUnitId, count: checklistItem.count })
    .from(checklistItem)
    .where(eq(checklistItem.checklistId, id));
  return rows;
}

export async function addToChecklist(
  db: Db,
  target: ChecklistScope,
  equipmentUnitId: string,
  count: number | null = null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unit = await getEquipmentUnit(db, equipmentUnitId);
  if (!unit || unit.status !== "active") {
    return { ok: false, error: "Missing or retired equipment can't go on the list." };
  }
  let id = await findChecklistId(db, target);
  if (!id) {
    id = crypto.randomUUID() as string;
    await db.insert(checklist).values({ id, ...target });
  }
  await db
    .insert(checklistItem)
    .values({ id: crypto.randomUUID(), checklistId: id, equipmentUnitId, count })
    .onConflictDoNothing();
  return { ok: true };
}

/** Sets the count a Checklist line asks for; null goes back to "all of them". */
export async function setChecklistItemCount(
  db: Db,
  target: ChecklistScope,
  equipmentUnitId: string,
  count: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = await findChecklistId(db, target);
  if (!id) return { ok: false, error: "That list doesn't exist yet." };
  await db
    .update(checklistItem)
    .set({ count })
    .where(and(eq(checklistItem.checklistId, id), eq(checklistItem.equipmentUnitId, equipmentUnitId)));
  return { ok: true };
}

export async function removeFromChecklist(db: Db, target: ChecklistScope, equipmentUnitId: string) {
  const id = await findChecklistId(db, target);
  if (!id) return;
  await db
    .delete(checklistItem)
    .where(and(eq(checklistItem.checklistId, id), eq(checklistItem.equipmentUnitId, equipmentUnitId)));
}

/** Drops this level's own Checklist so the Event falls back to the next level. */
export async function clearChecklist(db: Db, target: ChecklistScope) {
  const id = await findChecklistId(db, target);
  if (!id) return;
  await db.delete(checklistItem).where(eq(checklistItem.checklistId, id));
  await db.delete(checklist).where(eq(checklist.id, id));
}

/** Event's own Checklist, else its Series', else its Event Type's Default — with each
 * line's effective count (capped at the Equipment Unit's current Quantity). */
export async function resolveEventChecklist(
  db: Db,
  event: { eventId: string; seriesId: string | null; eventType: string },
): Promise<ResolvedEventChecklist> {
  const resolved = resolveChecklist({
    event: await getChecklist(db, { scope: "event", scopeId: event.eventId }),
    series: event.seriesId
      ? await getChecklist(db, { scope: "series", scopeId: event.seriesId })
      : undefined,
    default: await getChecklist(db, { scope: "event_type", scopeId: event.eventType }),
  });
  const units = await listEquipmentUnitsByIds(
    db,
    resolved.items.map((i) => i.equipmentUnitId),
  );
  const quantityById = new Map(units.map((u) => [u.id, u.quantity]));
  return {
    source: resolved.source,
    items: resolved.items.map((i) => ({
      equipmentUnitId: i.equipmentUnitId,
      count: effectiveCount(i.count, quantityById.get(i.equipmentUnitId) ?? 1),
    })),
  };
}
