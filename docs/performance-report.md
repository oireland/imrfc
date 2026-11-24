# Performance report — September 2026

## November 2026: re-measured

The same season, seeded the same way, after the P0 fixes and most of P1 landed. It's now a test that runs every page component against a seeded season on PGlite, counting queries through drizzle's `logger`: `src/app/(app)/query-budget.test.tsx`, with the seed in `src/test/season.ts`. Async server components inside a page (the Availability card on Event detail) are counted too. The session lookup is not, as before. The test fails if a page goes over its budget.

| Page | Sept queries | Nov queries | Budget | Nov time (PGlite) |
| --- | ---: | ---: | ---: | ---: |
| Home `/` | 1,655 | **27** | 30 | ~70 ms |
| Event detail `/events/[id]` | 1,088 | **39** | 43 | ~80 ms |
| Equipment detail `/equipment/[id]` | 1,076 | **13** | 15 | ~35 ms |
| Equipment `/equipment` | 576 | **5** | 6 | ~10 ms |
| Events `/events` | 541 | **13** | 15 | ~35 ms |

Home is inside the 20–30 this report predicted. The Caching section's preconditions about query counts are now met, so prefetching the tabs no longer multiplies a thousand-query page. The writes during render (`markUnconfirmed`, `ensureDuties`) are still there; PLAN L3 deals with them.

Event detail is measured as a Committee User on the next upcoming Event, with the measured User's Duty on it.

## Summary (September)

The app feels slow for two reasons, and the second is much bigger than the first:

1. **Every navigation waits on the server.** Every page is dynamic because it reads the session. Next 16's client router caches dynamic pages for 0 seconds, and each segment has a `loading.tsx`. So a tap on a tab shows the skeleton, then waits for a full server render, every time, including going back to a page you just saw.
2. **Each of those server renders makes hundreds to thousands of database queries.** Checklist resolution runs as an N+1 over every upcoming Event, and in `markUnconfirmed` over every past Event ever. The same work is repeated several times per page. The skeleton stays up because the server is doing far too much work.

Caching (point 1) would hide the problem on repeat visits. Fixing the queries (point 2) makes the first visit fast. Do the query fixes first. Caching then makes navigation feel instant.

### Measured query counts

I seeded an in-memory PGlite with a realistic season: 40 Users, 12 Equipment Units, default Checklists for training and match, two trainings a week plus a Saturday match from January 2026 to June 2027 (106 upcoming Events, 114 past), and 6 Duties for one User. Then I ran each page's data loading exactly as the page does it. Session lookups are not included.

| Page | Queries per render | Time on PGlite (no network) |
| --- | ---: | ---: |
| Home `/` | **1,655** | 1.16 s |
| Event detail `/events/[id]` | **1,088** | 0.69 s |
| Equipment detail `/equipment/[id]` | **1,076** | 0.68 s |
| Equipment `/equipment` | 576 | 0.36 s |
| Events `/events` | 541 | 0.33 s |

The biggest contributors:

| Function | Queries | Called from |
| --- | ---: | --- |
| `markUnconfirmed` | 572 | Home, Equipment (every render) |
| `listUpcomingDutiesForUser` | 534 | Home (**twice**), Events, player pages |
| `listClashes` | 535 | Event detail, Equipment detail |
| `listHeadsUps` | 536 | Event detail, Equipment detail (repeats the whole plan load `listClashes` just did) |

These numbers grow with the calendar. `markUnconfirmed` covers every past Event, so it gets slower every week for the life of the app.

In production, each query also pays a network round trip to Neon, with at most 10 in flight per function instance (postgres.js default pool). At ~1 ms same-region RTT, Home's 1,655 queries cost roughly 0.2–0.5 s on top of CPU time. If the Neon project isn't in London, a ~20–80 ms RTT makes that **seconds**. You can't fix that with caching.

After the P0 fixes below, Home should be roughly 20–30 queries and should stay about that size as the calendar grows.

---

## P0: the query explosion

### 1. Checklist resolution is an N+1 with 4 sequential queries per Event

`resolveEventChecklist` (`src/features/checklists/index.ts:97`) runs four queries one after another: the Event's own Checklist, the Series Checklist, the type default, and the Equipment Units. Each `getChecklist` is itself a lookup plus an items query. Callers run it once per Event:

- `resolveChecklistsForEvents` (`src/features/duties/index.ts`) for **every upcoming Event** in `listUpcomingDutiesForUser`, even though only the Events the User has Duties on are used.
- `loadPlan` for every upcoming Event (behind `listClashes` / `listHeadsUps`).
- `markUnconfirmed` for **every past Event ever**.

**Fix:** add a batch resolver to the checklists feature, `resolveEventChecklists(db, events[])`, that loads every relevant Checklist in about 3 queries in total:

1. Checklists where `(scope, scope_id)` is in the Event ids, the Series ids, or the event types.
2. Their items.
3. The Equipment Units.

Then run the existing pure `resolveChecklist` rule per Event in memory. Keep `resolveEventChecklist` as a thin wrapper over it. The rule is already plain TypeScript, so this is a data-loading change only, and the existing tests pin the behaviour.

### 2. `markUnconfirmed` runs on every Home and Equipment page view

`src/app/(app)/page.tsx:33` and `src/app/(app)/equipment/page.tsx:30` call it before rendering. It:

- loads every past Event ever, then all their Duties, then resolves every past Event's Checklist (fix 1 helps here);
- is a **write during a GET render**, which rules out ever caching those pages and races when two people open Home at once.

**Fix, in two parts:**

- Narrow the query to the only rows that can matter: From Duties that are unconfirmed and not voided, on ended and uncancelled Events, whose To Duty *is* confirmed. That's one joined SQL query, and on almost every page view it returns zero rows and exits. Only resolve Checklists for the Events it returns.
- Move it off the render path. It already runs as part of confirming a Duty. Also run it from the daily cron (`/api/cron/morning-of`). Then either keep a cheap guarded call in the Equipment page's server action path, or call it through `after()` (from `next/server`) so it never blocks a response. With the narrowed query, running it in render is cheap enough to keep as an interim step if you want Whereabouts exact to the minute.

### 3. The equipment plan is loaded twice per page, and it covers the whole future

`listClashes` and `listHeadsUps` (`src/features/duties/index.ts:577-585`) each call `loadPlan`, which loads every upcoming Event, all their Duties, a Checklist per Event, and every Portion. Event detail and Equipment detail call both, in parallel, so the whole plan is built twice. Event detail then throws away everything except the rows for one Event.

**Fix:**

- Expose one `listPlanWarnings(db)` that loads the plan once and returns `{ clashes, headsUps }`, or wrap `loadPlan` in React `cache()` so it's shared within a request.
- With fix 1 in place, `loadPlan` drops to about 6–8 queries.
- Later, when the data is cached (see *Caching*), this is the best candidate for `"use cache"` + `cacheTag("plan")`. It's the same for every User and only changes when Duties, Checklists, Events or Moves change.

### 4. `listUpcomingDutiesForUser` runs twice on Home and does too much

Home calls it directly and again inside `loadComingUp` (`src/app/(app)/coming-up-data.ts:21`). Each call resolves Checklists for all 106 upcoming Events, but only the handful with the User's Duties matter.

**Fix:**

- Only resolve Checklists for `rows.map(r => r.eventId)`.
- Have `loadComingUp` take the Duties list as an argument, or wrap the function in `cache()`, so Home runs it once.

---

## P1: request overhead and waterfalls

### 5. The session is looked up 3+ times per request, from the database each time

`getCurrentUser` (`src/lib/auth/session.ts`) calls `auth.api.getSession`. It isn't wrapped in `cache()`, and it runs in:

- the root layout (for the theme);
- the `(app)` layout;
- the page itself;
- every server action.

Better Auth has no `cookieCache` configured, so each call reads the session and the User from Postgres.

**Fix:**

- Wrap `getCurrentUser` in React `cache()`. That's one line, and the request then does a single lookup.
- Optionally, enable `session: { cookieCache: { enabled: true, maxAge: 60 * 5 } }` in `src/lib/auth/auth.ts`. This skips the DB entirely on most requests. **Trade-off:** a Block or role change takes up to `maxAge` to take effect on that User's open session. Keep the server actions that matter (admin actions, `requireApprovedUser` inside mutations) on a fresh read (`disableCookieCache: true`) if that matters to you.

### 6. The root layout reads the session just for the theme

`src/app/layout.tsx:42` makes *every* route dynamic, including `/sign-in`, `/waiting-for-approval` and `/blocked`, and costs a session lookup on each. It also means the document shell can never be static, which blocks the Cache Components plan below.

**Fix:** have `setTheme` also write a small `theme` cookie, and read it with `cookies()` in the root layout. Better: read it in a tiny client script in `<head>` (the pattern in `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`), which lets the root layout become fully static. Keep the DB column as the source of truth across devices.

### 7. Sequential waterfalls on the detail pages

`src/app/(app)/events/[id]/page.tsx` makes about 8 round trips in series:

1. `getEvent`
2. Checklist + units
3. `ensureDuties` + people + stores
4. clashes + heads-ups
5. portions
6. a `for … await getEvent()` loop for each "last seen" Event
7. venues
8. teams

`equipment/[id]/page.tsx:70` has the same sequential `getEvent` loop. `getEvent` is itself 2–3 queries (Event, then match details and teams), and it's used there only to read a title.

**Fix:**

- Add `listEventTitles(db, ids)` to the events feature, one `WHERE id IN (…)` query, and use it in place of the loops. Equipment's `lastSeenEvents` `Promise.all` becomes one query too.
- Start venues/teams in the first `Promise.all` instead of awaiting them at the end.
- Fetch `listApprovedUsers`, `listStores` and `listEquipmentUnits` in the same first batch as `getEvent`. They don't depend on it.

### 8. Writes during render

`ensureDuties` (`src/features/duties/index.ts:115`) runs an `INSERT … ON CONFLICT DO NOTHING` on every Event detail view. Together with `markUnconfirmed`, this means GETs mutate the database. That costs a write round trip on each view and makes the pages impossible to cache.

**Fix:**

- Create Duties when they become needed: when an Event is created, or when a Checklist (Event, Series or type default) changes.
- If that's too invasive for now, `SELECT` first and only insert the missing ones, so the common case is read-only.

### 9. Database driver and connection setup for Vercel

`src/db/client.ts` is `drizzle(postgres(DATABASE_URL))` with defaults. On Vercel with Neon:

- Use Neon's **pooled** connection string (`-pooler` host) at runtime, and set `prepare: false` (PgBouncer transaction mode doesn't support named prepared statements). Keep the direct URL for `drizzle-kit migrate`.
- Make sure the Neon project is in **AWS eu-west-2 (London)** to match `regions: ["lhr1"]` in `vercel.json`. After the query fixes this matters less, but it's still the floor on every query.

---

## Caching and navigation (the loading-screen fix)

### Why every navigation shows a skeleton today

- All `(app)` pages are dynamic: they read headers for the session.
- In production, `<Link>` prefetches a dynamic route only down to its nearest `loading.tsx`. So the skeleton is what's cached, not the page.
- `staleTimes.dynamic` defaults to **0 s** in Next 15+, so even a page you visited 5 seconds ago is fetched again. (See `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`.)
- In `pnpm dev`, routes also compile on first visit and nothing is prefetched, so dev is much worse than production. **Judge navigation speed with `pnpm build && pnpm start`.**

### Step A — quick wins (after the P0 fixes)

1. **Client router cache:**

   ```ts
   // next.config.ts
   experimental: { staleTimes: { dynamic: 30 } }
   ```

   Going back to a tab within 30 s is instant. Server actions already call `revalidatePath`, which clears the router cache, so your own edits still show at once. Another person's edit can take up to 30 s to appear, which is fine for this app.

2. **Prefetch the bottom tabs fully:** add `prefetch` (`prefetch={true}`) to the `Link`s in `src/components/bottom-tabs.tsx`. The tab bar is always on screen, so every tab's full page is fetched in the background and tapping a tab renders immediately. This multiplies server work per page view by about 5, so **only do it once pages are about 20–30 queries**, not 1,000+.

3. **Replace the full-page `loading.tsx` skeletons with `<Suspense>` around the slow sections.** For example, Home's greeting and duties first, then "What's coming up". The frame of the page appears immediately and only the slow part shows a placeholder.

### Step B — Cache Components (the proper fix)

Next 16 has **Cache Components** (`cacheComponents: true`) plus **Partial Prefetching** (`partialPrefetching: true`). The guide at `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md` covers them. With these, each route gets a prerendered shell plus cached data, and `<Link>` prefetches the *real* shell instead of a skeleton.

This app suits it well, because most of what a page shows is **the same for every member**:

| Data | Changes when | Cache as |
| --- | --- | --- |
| Events in a range, teams, venues | Event create, edit or cancel; Series create or extend | `"use cache"` + `cacheTag("events")` |
| Equipment Units, Portions, Stores | Moves, Confirm, quantity or status changes, store changes | `cacheTag("equipment")`, `cacheTag("stores")` |
| Approved Users and display names | approve, block, rename, positions | `cacheTag("users")` |
| Checklists and the plan (clashes, heads-ups) | Checklist edits, Duties, Moves, Events | `cacheTag("plan")` |
| The User's Duties, replies, held Equipment | that User's actions | dynamic in `<Suspense>`, or `"use cache: private"` |

Server actions then call `updateTag("events")` etc. instead of (or alongside) `revalidatePath`. `updateTag` gives read-your-own-writes, so the person who made the change sees it straight away.

What adopting it involves:

- `requireApprovedUser()` reads headers, so pages must move their per-user parts behind `<Suspense>`. The route guard stays in `proxy.ts` (cookie present) and in the per-user section.
- The root layout must stop reading the session (fix 6).
- Cached functions must take `db` from the module, not as an argument. Wrap them in thin cached adapters in `src/app` so the features stay framework-free, per the working rules.
- Timestamps: `new Date()` inside cached scope is restricted. Pass `now` in, or use `cacheLife` for Events ("upcoming" moves as time passes; `cacheLife("minutes")` is fine).
- Writes during render (fixes 2 and 8) must be gone first.

This is a slice-sized migration. Do it after the P0/P1 fixes, and verify it with the `@next/playwright` `instant()` helper described in the guide.

---

## P2: smaller items

- **Home and Events send 15 months of Events** (`loadComingUp`, 3 months back to 12 ahead, about 200 Events) in the RSC payload on every render. It's fine at this size. With caching, it's the obvious thing to split per month and load when paging.
- **Home loads every Equipment Unit, retired ones included, plus every approved User** just to look up names for a few Duty cards. Once `listUpcomingDutiesForUser` returns names or units, or those lists are cached, drop them.
- **Geist Mono** is loaded as a third web font for 3 `font-mono` usages. Consider a system mono stack. That's one fewer font file on first load.
- **`listPendingUsers(db)).length`** in the `(app)` layout loads full rows to count them. Use `count(*)`. It's trivial today, but it runs on every Admin navigation.
- The admin and player pages call `getCurrentUser` directly. They benefit automatically from fix 5.

## Suggested order

1. Batch Checklist resolution (1). This removes about 90% of queries everywhere.
2. Narrow `markUnconfirmed` and take it off render (2). Share the plan load (3). De-duplicate and narrow the upcoming-Duties load (4).
3. `cache()` on `getCurrentUser` (5), `listEventTitles` and parallelised fetching (7), read-only `ensureDuties` (8).
4. Theme cookie (6). Pooled Neon URL in London (9).
5. `staleTimes.dynamic: 30`, prefetched tabs, and granular `<Suspense>` (Step A).
6. Cache Components + Partial Prefetching (Step B), as its own slice.

Each of steps 1–3 is a behaviour-preserving refactor of feature functions with existing test coverage. A cheap guardrail would be a PGlite test that seeds a season and asserts Home's data loading stays under a query budget, using drizzle's `logger` to count queries, as the probe for this report did.
