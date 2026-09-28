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
- [x] **17. Checklist counts & Clashes by total** — Checklist lines ask for a count (default "all", capped at Quantity) at every level; Clashes fire only when overlapping/back-to-back Events need more than the Quantity; counts in Who's bringing what and the Duty Summary.
- [x] **18. Shared Duties** — several Users per Duty (Claim joins, Assign multi-select, leave / hand on your own place, From follows To); Confirm by any of them; confirm sheet asks where from (split unit) and who has how many (several Users, count > 1); Unconfirmed per portion; heads-ups, Blocking, Home, Duty Summary and Calendar Feed copy for several Users.
- [x] **18b. Onboarding** — a dismissible modal for a new User (blank name or no Preferred Position): name and Preferred Position (from the Players list, ahead of slice 20), a "what's in each tab" guide. "Not now" delays it for this browser tab; it reappears in a new tab or session until completed.
- [x] **19. Tabs** — drop the Events tab; "See all" from What's coming up on Home to Events; Members get Home · Kit · Profile, Committee add Players (placeholder until 20) and Admin.
- [x] **20. Players & Positions** — `players` feature: Playing (default on; switched off by the User or Committee), Preferred and Other Positions; Playing section in Profile; Players tab (position order, name search, Not playing section); Player page with Positions and the duty record (upcoming, season count, last 5). Clubhouse mock-up of the list and Player page first.
- [x] **20a. Availability replies** — `availability` feature: Available (optional note) / Not available (Reason required) / No reply for Training and Matches; one reply covers every Match that day; change until start; Committee reply for a Player ("set by"); Reasons for Committee and the Player only; Availability card on Event detail (counts, three tabs, theme colours); Share button, sign-in returns to the page, title-and-date link preview.
- [x] **20b. Announce & Nudge** — Announce once per Event (whole day for Matches) with optional Reply By and "late"; Nudge all with No reply or chosen ones, "nudged 2h ago"; emails linking to the Event; Copy chase message.
- [ ] **20c. Availability on Home & Player page** — "Can you make it?" card on Home for announced Events with no reply, answered inline; season Availability record on the Player page.
- [ ] **20d. Selection** — grill first (selection board and team sheets from the handover), then slice.
- [ ] **21. Injuries** — `injuries` feature: report/update from Profile or the Player page, Injury Status history with who/when, Logged by mistake, Fitness (worst open Injury) on the list with the summary line and Injured-only filter, check-in flags, Home card for my open Injuries, privacy line.
- [ ] **22. Concussion timeline** — Concussion flag, Symptom-free Date, Earliest contact training / Earliest Match, GRAS stages, NHS 111 / GP prompts, Committee-only Clear.
- [ ] **23. Physio Summary** — "Copy for physio" on the Players page and on Matches.
- [ ] **24. PWA** — manifest, icons, iOS home-screen meta.

After v1: deploy to Vercel + Neon, choose production mail sender (it must allow ~300 emails/day for Announce). Follow-ups: scheduled Announce; emails when an announced Event changes or is Cancelled.
