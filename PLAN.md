# Build plan

Vertical slices, built in order, each test-first (red → green → refactor). A slice is done when its tests pass, it works end-to-end in `pnpm dev`, and the user has reviewed it. Spec: [SPEC.md](SPEC.md).

- [x] **0. Scaffold** — Next.js (App Router, TS, pnpm); Tailwind + shadcn with the crest palette theme file (SPEC → Look and feel); Drizzle; Vitest with a PGlite test-database helper; Playwright; `docker-compose.yml` (Postgres + Mailpit); feature folder layout; one passing test of each kind.
- [x] **1. Sign-in & approval** — Better Auth (Google + magic link via pluggable mail sender); Pending → Approved; `ADMIN_EMAILS` bootstrap; Roles; route guards; Admin pending list + badge.
- [x] **2. Users admin** — change Roles; block/unblock (sessions revoked). Duty/kit side-effects come in slice 10.
- [x] **3. Locations** — Committee CRUD, Venue/Store flags, archive. (Later: Venues became free text on Events and Locations became Stores only.)
- [x] **4. Kit Units** — Committee CRUD, Home, Kit Status, Condition Note.
- [x] **5. Whereabouts & Moves** — ad-hoc Moves, Movement Log, Kit view grouped by Whereabouts, Kit Unit detail.
- [x] **6. Events** — Training/Match/Social with type-specific details, Teams (seeded), Upcoming/Past, Event detail with maps link, Cancel.
- [x] **7. Series** — create with end date → Occurrences; edit "this one" / "this and future"; extend; cancel an Occurrence.
- [x] **8. Checklists** — Default Checklist per Event Type, Series and Event overrides, resolution order.
- [x] **9. Duties** — Claim/Assign To Duty → From Duty follows; hand on; Destination defaulting to Home.
- [x] **10. Confirm** — Confirm → Move; Unconfirmed after Event end; Cancelled Events void Duties; Blocking side-effects on Duties and held Kit.
- [x] **11. Home screen** — my Duties, next Events, Kit I Hold.
- [x] **12. Clashes** — the four warnings on Event and Kit Unit views.
- [x] **13. Duty Summary** — WhatsApp copy button.
- [x] **14. Calendar Feed** — Feed Token, ICS with my Duties, reset, dead for Blocked Users.
- [x] **15. Design pass** — sweep every screen: replace raw HTML controls with shadcn/ui components, apply the crest palette theme tokens (SPEC → Look and feel), consistent mobile-first layout, light/dark check.
- [x] **15a. Clubhouse redesign** — warm light/dark theme with the crest as theme menu (saved per User); no app name; Home with 2-up Duty cards and What’s coming up (month Calendar with readable Events and tap-a-day quick add, Agenda); Events uses the same view; add Kit Units and Events from their own pages; toasts on create; back links; clearer Kit view.
- [x] **16. Quantity & split Whereabouts** — Quantity on Kit Units (default 1, hidden at 1, raise/lower logged); Whereabouts as portions with counts; ad-hoc Moves with a count and a source; Kit view shows split units in each group; migrate existing units to one portion.
- [ ] **17. Checklist counts & Clashes by total** — Checklist lines ask for a count (default "all", capped at Quantity) at every level; Clashes fire only when overlapping/back-to-back Events need more than the Quantity; counts in Who's bringing what and the Duty Summary.
- [ ] **18. Shared Duties** — several Users per Duty (Claim joins, Assign multi-select, leave / hand on your own place, From follows To); Confirm by any of them; confirm sheet asks where from (split unit) and who has how many (several Users, count > 1); Unconfirmed per portion; heads-ups, Blocking, Home, Duty Summary and Calendar Feed copy for several Users.
- [ ] **19. PWA** — manifest, icons, iOS home-screen meta.

After v1: deploy to Vercel + Neon, choose production mail sender, then Availability/RSVP as the first extension.
