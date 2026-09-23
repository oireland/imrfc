# Build plan

Vertical slices, built in order, each test-first (red → green → refactor). A slice is done when its tests pass, it works end-to-end in `pnpm dev`, and the user has reviewed it. Spec: [SPEC.md](SPEC.md).

- [x] **0. Scaffold** — Next.js (App Router, TS, pnpm); Tailwind + shadcn with the crest palette theme file (SPEC → Look and feel); Drizzle; Vitest with a PGlite test-database helper; Playwright; `docker-compose.yml` (Postgres + Mailpit); feature folder layout; one passing test of each kind.
- [x] **1. Sign-in & approval** — Better Auth (Google + magic link via pluggable mail sender); Pending → Approved; `ADMIN_EMAILS` bootstrap; Roles; route guards; Admin pending list + badge.
- [x] **2. Users admin** — change Roles; block/unblock (sessions revoked). Duty/kit side-effects come in slice 10.
- [x] **3. Locations** — Committee CRUD, Venue/Store flags, archive.
- [ ] **4. Kit Units** — Committee CRUD, Home, Kit Status, Condition Note.
- [ ] **5. Whereabouts & Moves** — ad-hoc Moves, Movement Log, Kit view grouped by Whereabouts, Kit Unit detail.
- [ ] **6. Events** — Training/Match/Social with type-specific details, Teams (seeded), Upcoming/Past, Event detail with maps link, Cancel.
- [ ] **7. Series** — create with end date → Occurrences; edit "this one" / "this and future"; extend; cancel an Occurrence.
- [ ] **8. Checklists** — Default Checklist per Event Type, Series and Event overrides, resolution order.
- [ ] **9. Duties** — Claim/Assign To Duty → From Duty follows; hand on; Destination defaulting to Home.
- [ ] **10. Confirm** — Confirm → Move; Unconfirmed after Event end; Cancelled Events void Duties; Blocking side-effects on Duties and held Kit.
- [ ] **11. Home screen** — my Duties, next Events, Kit I Hold.
- [ ] **12. Clashes** — the four warnings on Event and Kit Unit views.
- [ ] **13. Duty Summary** — WhatsApp copy button.
- [ ] **14. Calendar Feed** — Feed Token, ICS with my Duties, reset, dead for Blocked Users.
- [ ] **15. Design pass** — sweep every screen: replace raw HTML controls with shadcn/ui components, apply the crest palette theme tokens (SPEC → Look and feel), consistent mobile-first layout, light/dark check.
- [ ] **16. PWA** — manifest, icons, iOS home-screen meta.

After v1: deploy to Vercel + Neon, choose production mail sender, then Availability/RSVP as the first extension.
