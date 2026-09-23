import { eq } from "drizzle-orm";
import { location } from "./schema";
import { validateLocation, type NewLocation } from "./rules";

export { validateLocation } from "./rules";
export type { NewLocation } from "./rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Location = typeof location.$inferSelect;

export async function listLocations(
  db: Db,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<Location[]> {
  if (includeArchived) return db.select().from(location);
  return db.select().from(location).where(eq(location.archived, false));
}

export async function createLocation(
  db: Db,
  input: NewLocation,
): Promise<{ ok: true; location: Location } | { ok: false; error: string }> {
  const result = validateLocation(input);
  if (!result.ok) return result;

  const [row] = await db
    .insert(location)
    .values({ id: crypto.randomUUID(), ...input })
    .returning();
  return { ok: true, location: row };
}

export async function archiveLocation(db: Db, id: string) {
  await db.update(location).set({ archived: true }).where(eq(location.id, id));
}
