import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { session, user } from "./schema";
import {
  approveUser,
  blockUser,
  listApprovedUsers,
  listPendingUsers,
  setName,
  setPreferredPosition,
  setThemePreference,
  setRole,
  unblockUser,
} from "./index";

async function seedUser(
  db: Awaited<ReturnType<typeof createTestDb>>,
  overrides: Partial<typeof user.$inferInsert> = {},
) {
  const [row] = await db
    .insert(user)
    .values({
      id: overrides.id ?? crypto.randomUUID(),
      name: overrides.name ?? "Test Player",
      email: overrides.email ?? `${crypto.randomUUID()}@example.com`,
      role: overrides.role ?? "member",
      accessState: overrides.accessState ?? "pending",
    })
    .returning();
  return row;
}

describe("listPendingUsers", () => {
  it("returns only Pending Users", async () => {
    const db = await createTestDb();
    await migrate(db);
    await seedUser(db, { accessState: "pending", name: "Pending Pat" });
    await seedUser(db, { accessState: "approved", name: "Approved Alex" });

    const pending = await listPendingUsers(db);

    expect(pending.map((u: { name: string }) => u.name)).toEqual(["Pending Pat"]);
  });
});

describe("approveUser", () => {
  it("moves a Pending User to Approved", async () => {
    const db = await createTestDb();
    await migrate(db);
    const pat = await seedUser(db, { accessState: "pending" });

    await approveUser(db, pat.id);

    const [updated] = await db.select().from(user).where(eq(user.id, pat.id));
    expect(updated.accessState).toBe("approved");
  });
});

describe("blockUser / unblockUser", () => {
  it("blocks an Approved User and can unblock them back to Approved", async () => {
    const db = await createTestDb();
    await migrate(db);
    const alex = await seedUser(db, { accessState: "approved" });

    await blockUser(db, alex.id);
    const [blocked] = await db.select().from(user).where(eq(user.id, alex.id));
    expect(blocked.accessState).toBe("blocked");

    await unblockUser(db, alex.id);
    const [unblocked] = await db.select().from(user).where(eq(user.id, alex.id));
    expect(unblocked.accessState).toBe("approved");
  });

  it("revokes the User's sessions", async () => {
    const db = await createTestDb();
    await migrate(db);
    const alex = await seedUser(db, { accessState: "approved" });
    await db.insert(session).values({
      id: crypto.randomUUID(),
      userId: alex.id,
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await blockUser(db, alex.id);

    const remaining = await db.select().from(session).where(eq(session.userId, alex.id));
    expect(remaining).toEqual([]);
  });
});

describe("listApprovedUsers", () => {
  it("returns Approved and Blocked Users, excluding Pending", async () => {
    const db = await createTestDb();
    await migrate(db);
    await seedUser(db, { accessState: "pending", name: "Pending Pat" });
    await seedUser(db, { accessState: "approved", name: "Approved Alex" });
    await seedUser(db, { accessState: "blocked", name: "Blocked Bo" });

    const users = await listApprovedUsers(db);

    expect(users.map((u: { name: string }) => u.name).sort()).toEqual([
      "Approved Alex",
      "Blocked Bo",
    ]);
  });
});

describe("setRole", () => {
  it("changes a User's Role", async () => {
    const db = await createTestDb();
    await migrate(db);
    const alex = await seedUser(db, { role: "member" });

    await setRole(db, alex.id, "committee");

    const [updated] = await db.select().from(user).where(eq(user.id, alex.id));
    expect(updated.role).toBe("committee");
  });
});

describe("setName", () => {
  it("saves a trimmed name", async () => {
    const db = await createTestDb();
    await migrate(db);
    const u = await seedUser(db, { name: "" });

    await setName(db, u.id, "  Ollie Ireland ");

    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.name).toBe("Ollie Ireland");
  });

  it("refuses a blank name", async () => {
    const db = await createTestDb();
    await migrate(db);
    const u = await seedUser(db, { name: "Kept" });

    expect(await setName(db, u.id, "   ")).toEqual({ ok: false, error: "Please enter your name." });

    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.name).toBe("Kept");
  });
});

describe("setPreferredPosition", () => {
  it("saves the chosen Position", async () => {
    const db = await createTestDb();
    await migrate(db);
    const u = await seedUser(db);

    await setPreferredPosition(db, u.id, "Fly-half");

    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.preferredPosition).toBe("Fly-half");
  });
});

describe("setThemePreference", () => {
  it("defaults to system and saves a chosen theme", async () => {
    const db = await createTestDb();
    await migrate(db);
    const u = await seedUser(db);
    expect(u.theme).toBe("system");

    await setThemePreference(db, u.id, "dark");

    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.theme).toBe("dark");
  });
});
