import { eq, ne } from "drizzle-orm";
import { kitUnit } from "./schema";
import { validateKitUnit, type NewKitUnit } from "./rules";

export { validateKitUnit } from "./rules";
export type { NewKitUnit } from "./rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type KitUnit = typeof kitUnit.$inferSelect;
export type KitStatus = KitUnit["status"];

export async function listKitUnits(
  db: Db,
  { includeRetired = false }: { includeRetired?: boolean } = {},
): Promise<KitUnit[]> {
  if (includeRetired) return db.select().from(kitUnit);
  return db.select().from(kitUnit).where(ne(kitUnit.status, "retired"));
}

export async function createKitUnit(
  db: Db,
  input: NewKitUnit,
): Promise<{ ok: true; kitUnit: KitUnit } | { ok: false; error: string }> {
  const result = validateKitUnit(input);
  if (!result.ok) return result;

  const [row] = await db
    .insert(kitUnit)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  return { ok: true, kitUnit: row };
}

export async function setKitStatus(db: Db, id: string, status: KitStatus) {
  await db.update(kitUnit).set({ status }).where(eq(kitUnit.id, id));
}

export async function setConditionNote(db: Db, id: string, conditionNote: string) {
  await db.update(kitUnit).set({ conditionNote }).where(eq(kitUnit.id, id));
}
