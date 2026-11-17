import type { Sql } from "postgres";

export type SeedPortion = { count: number } & ({ storeId: string } | { holderId: string } | { lastSeenEventId: string });

/**
 * Inserts an Equipment Unit and its portions in one transaction: the database checks at commit that
 * the portions add up to the Quantity. With no `portions`, the whole Quantity is at Home. Each portion
 * is logged as added there, so the Movement Log replays to the same portions, as the app's would.
 */
export async function seedEquipmentUnit(
  sql: Sql,
  unit: { id: string; name: string; homeId: string; quantity?: number; portions?: SeedPortion[] },
) {
  const portions = unit.portions ?? [{ count: unit.quantity ?? 1, storeId: unit.homeId }];
  const quantity = unit.quantity ?? portions.reduce((total, p) => total + p.count, 0);
  await sql.begin(async (tx) => {
    await tx`insert into equipment_unit (id, name, home_id, quantity) values (${unit.id}, ${unit.name}, ${unit.homeId}, ${quantity})`;
    for (const p of portions) {
      const type = "storeId" in p ? "store" : "holderId" in p ? "holder" : "unconfirmed";
      const place = [type, "storeId" in p ? p.storeId : null, "holderId" in p ? p.holderId : null, "lastSeenEventId" in p ? p.lastSeenEventId : null];
      await tx`insert into equipment_portion (id, equipment_unit_id, count, whereabouts_type, store_id, holder_id, last_seen_event_id)
        values (${crypto.randomUUID()}, ${unit.id}, ${p.count}, ${place[0]}, ${place[1]}, ${place[2]}, ${place[3]})`;
      await tx`insert into movement_log_entry (id, equipment_unit_id, kind, count, to_type, to_store_id, to_holder_id, to_last_seen_event_id)
        values (${crypto.randomUUID()}, ${unit.id}, 'added', ${p.count}, ${place[0]}, ${place[1]}, ${place[2]}, ${place[3]})`;
    }
  });
}

/** Removes Equipment Units with their portions and log (test clean-up only; the app never deletes one). */
export async function deleteEquipmentUnits(sql: Sql, ids: string[]) {
  await sql.begin(async (tx) => {
    await tx`delete from movement_log_entry where equipment_unit_id in ${tx(ids)}`;
    await tx`delete from equipment_portion where equipment_unit_id in ${tx(ids)}`;
    await tx`delete from equipment_unit where id in ${tx(ids)}`;
  });
}
