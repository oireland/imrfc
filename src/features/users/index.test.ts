import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { user } from "./schema";
import { approveUser, blockUser, listPendingUsers, unblockUser } from "./index";

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
});
