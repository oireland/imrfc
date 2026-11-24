import { actOnDuty, duty, listEventDuties, type Duty, type DutyDestination } from "@/features/duties";
import type { Db } from "@/db/types";

// Test helpers that set up Duties and act on them the way the app does: through `actOnDuty`.

const member = (id: string) => ({ id, role: "member" as const });
const committee = (id = "committee") => ({ id, role: "committee" as const });

/** Creates the To and From Duty for each Equipment Unit (if missing) and returns them, To first. */
export async function ensureDuties(db: Db, eventId: string, equipmentUnitIds: string[]): Promise<Duty[]> {
  if (equipmentUnitIds.length === 0) return [];
  await db
    .insert(duty)
    .values(
      equipmentUnitIds.flatMap((equipmentUnitId) =>
        (["to", "from"] as const).map((direction) => ({ id: crypto.randomUUID(), eventId, equipmentUnitId, direction })),
      ),
    )
    .onConflictDoNothing();
  return (await listEventDuties(db, eventId, equipmentUnitIds, { cancelled: false })) as Duty[];
}

export const claim = (db: Db, dutyId: string, userId: string, count?: number) =>
  actOnDuty(db, dutyId, member(userId), { action: "claim", count });
export const leave = (db: Db, dutyId: string, userId: string) => actOnDuty(db, dutyId, member(userId), { action: "leave" });
export const handOn = (db: Db, dutyId: string, actorId: string, toUserId: string) =>
  actOnDuty(db, dutyId, member(actorId), { action: "handOn", userId: toUserId });
export const assign = (db: Db, dutyId: string, userIds: string[]) =>
  actOnDuty(db, dutyId, committee(), { action: "assign", userIds });
export const setDestination = (db: Db, dutyId: string, destination: DutyDestination) =>
  actOnDuty(db, dutyId, committee(), { action: "setDestination", destination });
