import { and, eq, inArray, isNull } from "drizzle-orm";
import { duty } from "./schema";

export { duty } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type DutyDestination = { type: "home" } | { type: "store"; storeId: string } | { type: "holder" };
export type Duty = Omit<typeof duty.$inferSelect, "destinationType" | "destinationStoreId"> & {
  destination: DutyDestination;
};
type Result = { ok: true } | { ok: false; error: string };

function toDuty(row: typeof duty.$inferSelect): Duty {
  const { destinationType, destinationStoreId, ...rest } = row;
  const destination: DutyDestination =
    destinationType === "store" && destinationStoreId
      ? { type: "store", storeId: destinationStoreId }
      : destinationType === "holder"
        ? { type: "holder" }
        : { type: "home" };
  return { ...rest, destination };
}

async function getDuty(db: Db, id: string): Promise<typeof duty.$inferSelect | undefined> {
  const [row] = await db.select().from(duty).where(eq(duty.id, id));
  return row;
}

/** Makes sure each Kit Unit on the Event's Checklist has its To and From Duty, and returns them. */
export async function ensureDuties(db: Db, eventId: string, kitUnitIds: string[]): Promise<Duty[]> {
  if (kitUnitIds.length === 0) return [];
  await db
    .insert(duty)
    .values(
      kitUnitIds.flatMap((kitUnitId) =>
        (["to", "from"] as const).map((direction) => ({
          id: crypto.randomUUID(),
          eventId,
          kitUnitId,
          direction,
        })),
      ),
    )
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(duty)
    .where(and(eq(duty.eventId, eventId), inArray(duty.kitUnitId, kitUnitIds)));
  return rows.map(toDuty);
}

/** Fills a Duty; a To Duty also pulls its still-unfilled From Duty along to the same User. */
async function fill(db: Db, row: typeof duty.$inferSelect, userId: string) {
  await db.update(duty).set({ userId }).where(eq(duty.id, row.id));
  if (row.direction === "to") {
    await db
      .update(duty)
      .set({ userId })
      .where(
        and(
          eq(duty.eventId, row.eventId),
          eq(duty.kitUnitId, row.kitUnitId),
          eq(duty.direction, "from"),
          isNull(duty.userId),
        ),
      );
  }
}

/** Any User takes an unfilled Duty for themselves. */
export async function claimDuty(db: Db, dutyId: string, userId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "Duty not found." };
  if (row.userId) return { ok: false, error: "That Duty is already taken." };
  await fill(db, row, userId);
  return { ok: true };
}

/** Committee fills a Duty with a named User, replacing whoever held it. */
export async function assignDuty(db: Db, dutyId: string, userId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "Duty not found." };
  await fill(db, row, userId);
  return { ok: true };
}

export async function unassignDuty(db: Db, dutyId: string) {
  await db.update(duty).set({ userId: null }).where(eq(duty.id, dutyId));
}

/** A User passes their own Duty to someone else. */
export async function handOnDuty(db: Db, dutyId: string, actorId: string, toUserId: string): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "Duty not found." };
  if (row.userId !== actorId) return { ok: false, error: "You can only hand on your own Duty." };
  await db.update(duty).set({ userId: toUserId }).where(eq(duty.id, dutyId));
  return { ok: true };
}

export async function setDestination(db: Db, dutyId: string, destination: DutyDestination): Promise<Result> {
  const row = await getDuty(db, dutyId);
  if (!row) return { ok: false, error: "Duty not found." };
  if (row.direction !== "from") return { ok: false, error: "Only a From Duty has a Destination." };
  await db
    .update(duty)
    .set({
      destinationType: destination.type,
      destinationStoreId: destination.type === "store" ? destination.storeId : null,
    })
    .where(eq(duty.id, dutyId));
  return { ok: true };
}
