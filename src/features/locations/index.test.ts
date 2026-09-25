import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { archiveLocation, createLocation, listLocations } from "./index";

describe("createLocation", () => {
  it("creates an Active, unarchived Location", async () => {
    const db = await createTestDb();
    await migrate(db);

    const result = await createLocation(db, {
      name: "Harlington",
      address: "Harlington, UB8",
      isVenue: true,
      isStore: false,
    });

    expect(result.ok).toBe(true);
    const locations = await listLocations(db);
    expect(locations).toMatchObject([{ name: "Harlington", archived: false }]);
  });

  it("rejects a Location that is neither a Venue nor a Store", async () => {
    const db = await createTestDb();
    await migrate(db);

    const result = await createLocation(db, {
      name: "Nowhere",
      address: "SW7",
      isVenue: false,
      isStore: false,
    });

    expect(result.ok).toBe(false);
    expect(await listLocations(db)).toEqual([]);
  });
});

describe("listLocations", () => {
  it("excludes archived Locations by default", async () => {
    const db = await createTestDb();
    await migrate(db);
    await createLocation(db, { name: "Store", address: "SW7", isVenue: false, isStore: true });
    const created = await createLocation(db, {
      name: "Old venue",
      address: "SW7",
      isVenue: true,
      isStore: false,
    });
    if (!created.ok) throw new Error("expected Location to be created");
    await archiveLocation(db, created.location.id);

    const locations = await listLocations(db);

    expect(locations.map((l: { name: string }) => l.name)).toEqual(["Store"]);
  });
});

describe("archiveLocation", () => {
  it("never hard-deletes a Location", async () => {
    const db = await createTestDb();
    await migrate(db);
    const created = await createLocation(db, {
      name: "Old venue",
      address: "SW7",
      isVenue: true,
      isStore: false,
    });
    if (!created.ok) throw new Error("expected Location to be created");

    await archiveLocation(db, created.location.id);

    const locations = await listLocations(db, { includeArchived: true });
    expect(locations).toMatchObject([{ name: "Old venue", archived: true }]);
  });
});
