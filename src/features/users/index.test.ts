import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { migrate } from "@/test/migrate";
import { createTestDb } from "@/test/db";
import { account, session, user } from "./schema";
import {
  approveUser,
  blockUser,
  blockUserAs,
  changeRole,
  listApprovedUsers,
  listKnownUsers,
  countPendingUsers,
  eraseUser,
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

  it("counts Pending Users", async () => {
    const db = await createTestDb();
    await migrate(db);
    await seedUser(db, { accessState: "pending" });
    await seedUser(db, { accessState: "pending" });
    await seedUser(db, { accessState: "approved" });

    expect(await countPendingUsers(db)).toBe(2);
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
  it("returns only Approved Users", async () => {
    const db = await createTestDb();
    await migrate(db);
    await seedUser(db, { accessState: "pending", name: "Pending Pat" });
    await seedUser(db, { accessState: "approved", name: "Approved Alex" });
    await seedUser(db, { accessState: "blocked", name: "Blocked Bo" });
    await seedUser(db, { accessState: "deleted", name: "Deleted Dee" });

    const users = await listApprovedUsers(db);

    expect(users.map((u: { name: string }) => u.name)).toEqual(["Approved Alex"]);
  });
});

describe("listKnownUsers", () => {
  it("returns everyone but Pending Users, so names in past records still resolve", async () => {
    const db = await createTestDb();
    await migrate(db);
    await seedUser(db, { accessState: "pending", name: "Pending Pat" });
    await seedUser(db, { accessState: "approved", name: "Approved Alex" });
    await seedUser(db, { accessState: "blocked", name: "Blocked Bo" });
    await seedUser(db, { accessState: "deleted", name: "Deleted Dee" });

    const users = await listKnownUsers(db);

    expect(users.map((u: { name: string }) => u.name).sort()).toEqual(["Approved Alex", "Blocked Bo", "Deleted Dee"]);
  });
});

describe("changeRole", () => {
  it("changes another User's Role", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ann = await seedUser(db, { role: "admin", accessState: "approved" });
    const tom = await seedUser(db, { accessState: "approved" });

    expect(await changeRole(db, { actorId: ann.id, userId: tom.id, role: "committee" })).toEqual({ ok: true });

    expect((await db.select().from(user).where(eq(user.id, tom.id)))[0].role).toBe("committee");
  });

  it("refuses a Role that doesn't exist", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ann = await seedUser(db, { role: "admin", accessState: "approved" });
    const tom = await seedUser(db, { accessState: "approved" });

    const result = await changeRole(db, { actorId: ann.id, userId: tom.id, role: "superuser" });

    expect(result.ok).toBe(false);
    expect((await db.select().from(user).where(eq(user.id, tom.id)))[0].role).toBe("member");
  });

  it("stops the last Admin demoting themselves", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ann = await seedUser(db, { role: "admin", accessState: "approved" });

    const result = await changeRole(db, { actorId: ann.id, userId: ann.id, role: "member" });

    expect(result.ok).toBe(false);
    expect((await db.select().from(user).where(eq(user.id, ann.id)))[0].role).toBe("admin");
  });

  it("lets an Admin demote themselves when another Admin remains", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ann = await seedUser(db, { role: "admin", accessState: "approved" });
    await seedUser(db, { role: "admin", accessState: "approved" });

    expect(await changeRole(db, { actorId: ann.id, userId: ann.id, role: "member" })).toEqual({ ok: true });
  });

  it("doesn't count a blocked Admin as one who remains", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ann = await seedUser(db, { role: "admin", accessState: "approved" });
    await seedUser(db, { role: "admin", accessState: "blocked" });

    expect((await changeRole(db, { actorId: ann.id, userId: ann.id, role: "member" })).ok).toBe(false);
  });
});

describe("blockUserAs", () => {
  it("stops an Admin blocking themselves", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ann = await seedUser(db, { role: "admin", accessState: "approved" });

    const result = await blockUserAs(db, { actorId: ann.id, userId: ann.id });

    expect(result.ok).toBe(false);
    expect((await db.select().from(user).where(eq(user.id, ann.id)))[0].accessState).toBe("approved");
  });

  it("blocks another User and ends their sessions", async () => {
    const db = await createTestDb();
    await migrate(db);
    const ann = await seedUser(db, { role: "admin", accessState: "approved" });
    const tom = await seedUser(db, { accessState: "approved" });

    expect(await blockUserAs(db, { actorId: ann.id, userId: tom.id })).toEqual({ ok: true });

    expect((await db.select().from(user).where(eq(user.id, tom.id)))[0].accessState).toBe("blocked");
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

describe("eraseUser", () => {
  it("wipes the User's personal details but keeps the row so their history still reads", async () => {
    const db = await createTestDb();
    await migrate(db);
    const tom = await seedUser(db, { name: "Tom Hale", email: "tom@example.com", accessState: "approved" });
    await db.update(user).set({ preferredPosition: "Hooker", otherPositions: ["Loosehead Prop"], image: "https://x/tom.png" }).where(eq(user.id, tom.id));

    await eraseUser(db, tom.id);

    const [row] = await db.select().from(user).where(eq(user.id, tom.id));
    expect(row).toMatchObject({
      name: "Deleted user",
      image: null,
      accessState: "deleted",
      preferredPosition: null,
      otherPositions: [],
      playing: false,
    });
    expect(row.email).not.toContain("tom");
  });

  it("frees the email, so signing in again starts a new account", async () => {
    const db = await createTestDb();
    await migrate(db);
    const tom = await seedUser(db, { email: "tom@example.com", accessState: "approved" });

    await eraseUser(db, tom.id);

    await expect(seedUser(db, { email: "tom@example.com" })).resolves.toBeDefined();
  });

  it("signs them out everywhere and unlinks their sign-in methods", async () => {
    const db = await createTestDb();
    await migrate(db);
    const tom = await seedUser(db, { accessState: "approved" });
    await db.insert(session).values({ id: "s1", userId: tom.id, token: "t1", expiresAt: new Date(Date.now() + 3_600_000) });
    await db.insert(account).values({ id: "a1", userId: tom.id, accountId: "google-tom", providerId: "google" });

    await eraseUser(db, tom.id);

    expect(await db.select().from(session).where(eq(session.userId, tom.id))).toEqual([]);
    expect(await db.select().from(account).where(eq(account.userId, tom.id))).toEqual([]);
  });

  it("leaves them out of the Users lists", async () => {
    const db = await createTestDb();
    await migrate(db);
    const tom = await seedUser(db, { accessState: "pending" });

    await eraseUser(db, tom.id);

    expect(await listPendingUsers(db)).toEqual([]);
    expect(await countPendingUsers(db)).toBe(0);
  });
});

describe("setName length limit", () => {
  it("refuses a name that's far too long", async () => {
    const db = await createTestDb();
    await migrate(db);
    const u = await seedUser(db, { name: "Kept" });

    expect(await setName(db, u.id, "a".repeat(101))).toEqual({
      ok: false,
      error: "The name is too long. Keep it to 100 characters or fewer.",
    });

    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.name).toBe("Kept");
  });
});
