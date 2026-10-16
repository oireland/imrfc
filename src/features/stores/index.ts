import { LIMITS, firstTooLong } from "@/lib/text-limits";
import { eq } from "drizzle-orm";
import { store } from "./schema";

// Other features' schema.ts files reference this table for foreign keys.
export { store } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type Store = typeof store.$inferSelect;
export type NewStore = { name: string; address: string };

export async function listStores(db: Db, { includeArchived = false }: { includeArchived?: boolean } = {}): Promise<Store[]> {
  if (includeArchived) return db.select().from(store);
  return db.select().from(store).where(eq(store.archived, false));
}

export async function createStore(
  db: Db,
  input: NewStore,
): Promise<{ ok: true; store: Store } | { ok: false; error: string }> {
  if (!input.name.trim()) return { ok: false, error: "Give the store a name." };
  const tooLong = firstTooLong([["name", input.name, LIMITS.name], ["address", input.address, LIMITS.line]]);
  if (tooLong) return { ok: false, error: tooLong };
  const [row] = await db
    .insert(store)
    .values({ id: crypto.randomUUID(), name: input.name.trim(), address: input.address })
    .returning();
  return { ok: true, store: row };
}

export async function archiveStore(db: Db, id: string) {
  await db.update(store).set({ archived: true }).where(eq(store.id, id));
}
