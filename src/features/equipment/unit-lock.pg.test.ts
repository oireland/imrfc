import { eq, sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createPostgresTestDb, lockWaiters, waitUntil } from "@/test/postgres";
import { createEquipmentUnit, equipmentPortion, recordMove } from ".";

/**
 * Runs on real Postgres (`pnpm test:pg`): PGlite has one connection, so it can't show two
 * transactions racing. To make the race happen every time rather than by luck, a third connection
 * holds the shields' Portion rows while both Moves start. Each Move then gets as far as it can
 * (with no Unit lock, that's past reading the Portions) before the rows are let go.
 */
it("two people taking shields from the Store at once both get theirs", async () => {
  const { db, client } = await createPostgresTestDb();
  await db.execute(sql`insert into "user" (id, name, email, email_verified) values
    ('sam', 'Sam', 'sam@example.com', true), ('tom', 'Tom', 'tom@example.com', true)`);
  await db.execute(sql`insert into store (id, name, address) values ('shed', 'Shed', 'x')`);
  const created = await createEquipmentUnit(db, { name: "Shields", homeId: "shed", quantity: 2 });
  if (!created.ok) throw new Error(created.error);
  const unitId = created.equipmentUnit.id;

  const holdPortions = await client.reserve();
  await holdPortions`begin`;
  await holdPortions`select id from equipment_portion where equipment_unit_id = ${unitId} for update`;

  const takeOne = (holderId: string) =>
    recordMove(db, unitId, holderId, { type: "holder", holderId }, "ad_hoc", { count: 1, from: { type: "store", storeId: "shed" } });
  const moves = Promise.allSettled([takeOne("sam"), takeOne("tom")]);
  await waitUntil(async () => (await lockWaiters(client)) === 2);
  await holdPortions`rollback`;
  holdPortions.release();

  expect(await moves).toEqual([
    { status: "fulfilled", value: { ok: true } },
    { status: "fulfilled", value: { ok: true } },
  ]);
  const portions = await db
    .select({ count: equipmentPortion.count, holderId: equipmentPortion.holderId })
    .from(equipmentPortion)
    .where(eq(equipmentPortion.equipmentUnitId, unitId));
  expect(portions).toEqual(
    expect.arrayContaining([
      { count: 1, holderId: "sam" },
      { count: 1, holderId: "tom" },
    ]),
  );
  expect(portions).toHaveLength(2);
});
