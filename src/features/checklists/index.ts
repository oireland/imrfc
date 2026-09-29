import { and, eq, inArray, or } from "drizzle-orm";
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

export type ChecklistEventRef = { eventId: string; seriesId: string | null; eventType: string };

/** Event's own Checklist, else its Series', else its Event Type's Default — with each
 * line's effective count (capped at the Equipment Unit's current Quantity). */
export async function resolveEventChecklist(db: Db, event: ChecklistEventRef): Promise<ResolvedEventChecklist> {
  return (await resolveEventChecklists(db, [event])).get(event.eventId)!;
}

/** `resolveEventChecklist` for many Events at once, keyed by Event id — in two queries however many there are. */
export async function resolveEventChecklists(
  db: Db,
  events: ChecklistEventRef[],
): Promise<Map<string, ResolvedEventChecklist>> {
  const result = new Map<string, ResolvedEventChecklist>();
  if (events.length === 0) return result;
  const eventIds = [...new Set(events.map((e) => e.eventId))];
  const seriesIds = [...new Set(events.flatMap((e) => (e.seriesId ? [e.seriesId] : [])))];
  const eventTypes = [...new Set(events.map((e) => e.eventType))];
  const rows: { scope: ChecklistScope["scope"]; scopeId: string; equipmentUnitId: string | null; count: number | null }[] = await db
    .select({
      scope: checklist.scope,
      scopeId: checklist.scopeId,
      equipmentUnitId: checklistItem.equipmentUnitId,
      count: checklistItem.count,
    })
    .from(checklist)
    .leftJoin(checklistItem, eq(checklistItem.checklistId, checklist.id))
    .where(
      or(
        and(eq(checklist.scope, "event"), inArray(checklist.scopeId, eventIds)),
        seriesIds.length > 0 ? and(eq(checklist.scope, "series"), inArray(checklist.scopeId, seriesIds)) : undefined,
        and(eq(checklist.scope, "event_type"), inArray(checklist.scopeId, eventTypes)),
      ),
    );

  // A level with a row but no items still has its own (empty) Checklist.
  const lines = new Map<string, ChecklistLine[]>();
  for (const r of rows) {
    const key = `${r.scope}:${r.scopeId}`;
    const list = lines.get(key) ?? [];
    if (r.equipmentUnitId) list.push({ equipmentUnitId: r.equipmentUnitId, count: r.count });
    lines.set(key, list);
  }

  const resolvedByEvent = events.map((e) => ({
    eventId: e.eventId,
    resolved: resolveChecklist({
      event: lines.get(`event:${e.eventId}`),
      series: e.seriesId ? lines.get(`series:${e.seriesId}`) : undefined,
      default: lines.get(`event_type:${e.eventType}`),
    }),
  }));
  const units = await listEquipmentUnitsByIds(db, [
    ...new Set(resolvedByEvent.flatMap(({ resolved }) => resolved.items.map((i) => i.equipmentUnitId))),
  ]);
  const quantityById = new Map(units.map((u) => [u.id, u.quantity]));
  for (const { eventId, resolved } of resolvedByEvent) {
    result.set(eventId, {
      source: resolved.source,
      items: resolved.items.map((i) => ({
        equipmentUnitId: i.equipmentUnitId,
        count: effectiveCount(i.count, quantityById.get(i.equipmentUnitId) ?? 1),
      })),
    });
  }
  return result;
}
