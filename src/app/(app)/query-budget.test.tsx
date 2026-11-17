import { isValidElement, type ReactNode } from "react";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { seedSeason } from "@/test/season";

// Each page runs against a seeded season on PGlite, through a db that counts its queries.
const h = vi.hoisted(() => ({
  db: undefined as unknown,
  user: undefined as unknown,
  requestCache: new Map<unknown, Map<string, unknown>>(),
}));
vi.mock("@/db/client", () => ({
  get db() {
    return h.db;
  },
}));
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => h.user,
  requireApprovedUser: async () => h.user,
  requireCommittee: async () => h.user,
  requireAdmin: async () => h.user,
}));
// React's cache() only memoises inside a server render; give each measured render its own.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const calls = h.requestCache.get(fn) ?? new Map<string, unknown>();
      h.requestCache.set(fn, calls);
      const key = JSON.stringify(args);
      if (!calls.has(key)) calls.set(key, fn(...args));
      return calls.get(key) as R;
    };
  return { ...react, default: react, cache };
});

/** Awaits the page and every async server component inside what it returns. */
async function renderData(node: unknown, seen = new Set<unknown>()): Promise<void> {
  if (node === null || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const child of node) await renderData(child, seen);
    return;
  }
  if (isValidElement(node)) {
    const { type, props } = node as { type: unknown; props: Record<string, unknown> };
    if (typeof type === "function" && type.constructor.name === "AsyncFunction") {
      await renderData(await (type as (p: unknown) => Promise<ReactNode>)(props), seen);
      return;
    }
    for (const value of Object.values(props)) await renderData(value, seen);
    return;
  }
  if (Object.getPrototypeOf(node) === Object.prototype) {
    for (const value of Object.values(node)) await renderData(value, seen);
  }
}

let seeded: Awaited<ReturnType<typeof seedSeason>>;
// Seeded once and shared: the pages only read, so the measurements don't disturb each other.
const client = new PGlite();
afterAll(() => client.close());

beforeAll(async () => {
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "drizzle" });
  seeded = await seedSeason(db);
  const { listKnownUsers } = await import("@/features/users");
  const me = (await listKnownUsers(db)).find((u) => u.id === seeded.userId)!;
  h.user = { ...me, theme: "system", preferredPosition: null, otherPositions: [], playing: true };
}, 120_000);

/** The SQL of every query one render of `page` makes. */
async function sqlFor(page: () => Promise<ReactNode>) {
  const sql: string[] = [];
  h.db = drizzle(client, { logger: { logQuery: (query) => void sql.push(query) } });
  h.requestCache.clear();
  await renderData(await page());
  return sql;
}

/** How many queries one render of `page` makes. */
async function queriesFor(page: () => Promise<ReactNode>) {
  return (await sqlFor(page)).length;
}

describe("queries per page render on a seeded season", () => {
  it("seeds the season the performance report measured", async () => {
    const { listEvents } = await import("@/features/events");
    const { listUpcomingDutiesForUser } = await import("@/features/duties");
    const db = drizzle(client);

    expect((await listEvents(db, { when: "upcoming" })).length).toBeGreaterThanOrEqual(100);
    expect((await listEvents(db, { when: "past" })).length).toBeGreaterThanOrEqual(110);
    expect(await listUpcomingDutiesForUser(db, seeded.userId)).toHaveLength(6);
  });

  // Measured in November 2026 (docs/performance-report.md), with a little headroom.
  // Raise a budget only when the page genuinely needs more, and say why in the report.
  const params = <T,>(value: T) => Promise.resolve(value);
  type Page = (props: never) => Promise<ReactNode>;
  const pages = [
    { page: "Home", budget: 30, load: () => import("./page"), props: () => ({}) },
    { page: "Event detail", budget: 43, load: () => import("./events/[id]/page"), props: () => ({ params: params({ id: seeded.nextEventId }) }) },
    { page: "Equipment Unit detail", budget: 15, load: () => import("./equipment/[id]/page"), props: () => ({ params: params({ id: seeded.unitId }) }) },
    { page: "Equipment", budget: 6, load: () => import("./equipment/page"), props: () => ({}) },
    { page: "Events", budget: 15, load: () => import("./events/page"), props: () => ({ searchParams: params({}) }) },
  ];
  it.each(pages)("$page stays within $budget queries", async ({ load, props, budget }) => {
    const page = (await load()).default as Page;

    expect(await queriesFor(() => page(props() as never))).toBeLessThanOrEqual(budget);
  });

  // Rendering a page changes nothing. The one allowed write is `markUnconfirmed` on Home and
  // Equipment (ADR 0006), and the seeded season has nothing for it to mark.
  // Event detail's Checklist has Equipment Units with no Duty rows yet, so it must not create them.
  it.each(pages)("$page writes nothing", async ({ page: name, load, props }) => {
    const page = (await load()).default as Page;
    // An upcoming Event nobody has acted on, so none of its Checklist has Duty rows.
    const { listEvents } = await import("@/features/events");
    const [, , , untouched] = await listEvents(drizzle(client), { when: "upcoming" });
    const given = name === "Event detail" ? { params: params({ id: untouched.id }) } : props();

    const writes = (await sqlFor(() => page(given as never))).filter((q) => /^\s*(insert|update|delete)\b/i.test(q));

    expect(writes).toEqual([]);
  });
});
