import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { archiveStore, createStore, listStores } from "./index";

describe("createStore", () => {
  it("creates an unarchived Store", async () => {
    const db = await createTestDb();
    await migrate(db);

    const result = await createStore(db, { name: "Equipment shed", address: "Ethos, SW7" });

    expect(result.ok).toBe(true);
    expect(await listStores(db)).toMatchObject([{ name: "Equipment shed", archived: false }]);
  });

  it("rejects a Store without a name", async () => {
    const db = await createTestDb();
    await migrate(db);

    const result = await createStore(db, { name: "  ", address: "SW7" });

    expect(result).toEqual({ ok: false, error: "Give the store a name." });
    expect(await listStores(db)).toEqual([]);
  });
});

describe("listStores", () => {
  it("excludes archived Stores by default", async () => {
    const db = await createTestDb();
    await migrate(db);
    await createStore(db, { name: "Equipment shed", address: "SW7" });
    const created = await createStore(db, { name: "Old cupboard", address: "SW7" });
    if (!created.ok) throw new Error("expected Store to be created");
    await archiveStore(db, created.store.id);

    const stores = await listStores(db);

    expect(stores.map((s) => s.name)).toEqual(["Equipment shed"]);
  });
});

describe("archiveStore", () => {
  it("never hard-deletes a Store", async () => {
    const db = await createTestDb();
    await migrate(db);
    const created = await createStore(db, { name: "Old cupboard", address: "SW7" });
    if (!created.ok) throw new Error("expected Store to be created");

    await archiveStore(db, created.store.id);

    expect(await listStores(db, { includeArchived: true })).toMatchObject([{ name: "Old cupboard", archived: true }]);
  });
});
