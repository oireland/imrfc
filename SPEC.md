# IMRFC Club Hub — Specification (v1)

Capitalised domain terms are defined in [CONTEXT.md](CONTEXT.md). Build order is in [PLAN.md](PLAN.md).

## Problem

Imperial Medicals RFC keeps forgetting kit and keeps asking the same questions on WhatsApp: *when is training, where is the ball bag, who's bringing the shields?* There is no single place for upcoming Events, no record of where Kit Units are, and no clear owner for carrying kit to and from each Event.

## Goals

1. One place to see every upcoming and past Event.
2. Always know each Kit Unit's Whereabouts.
3. Every Kit Unit an Event needs has a named person bringing it (To Duty) and taking it away (From Duty).
4. Nobody from outside the club gets in.
5. Easy to extend — Availability/RSVP is the reference extension (see [Extensions](#extensions)).

## Constraints

- Free to build and run: Next.js on Vercel (hobby), Neon Postgres (free), no paid services.
- Mobile-first; most use is on phones. ~50–150 users.
- Single club, single tenant. All times Europe/London (BST-aware).
- Built test-first (TDD). Vercel deployment only once fully working locally.

## Access

- Sign in with **Google** or **magic link** (email).
- New Users start **Pending** and see only a "Waiting for approval" screen.
- Admins see a pending-count badge and approve or block from the Admin area. No approval emails in v1.
- Emails in the `ADMIN_EMAILS` env var become Admin automatically on first sign-in.
- Profile: name and email (from the sign-in provider; name editable), plus a Preferred Position set during onboarding.
- **Onboarding**: a new User (blank name, or no Preferred Position yet) sees a dismissible modal asking for their name and Preferred Position, with a short guide to what each tab does. "Not now" delays it for that browser tab; it reappears next time the app is opened in a new tab or session until completed.
- Following a link while signed out (e.g. an Event shared in the group chat) goes through sign-in — Google or magic link — and lands back on that page. Only same-site paths are accepted. A new User who lands on "Waiting for approval" goes to Home once approved.
- **Roles** are club-wide and cumulative:

| Capability | Member | Committee | Admin |
|---|:-:|:-:|:-:|
| View Events, Kit, Duties, Movement Log | ✓ | ✓ | ✓ |
| Claim a Duty, Confirm own Duty, hand own Duty on | ✓ | ✓ | ✓ |
| Record an ad-hoc Move, edit Condition Note | ✓ | ✓ | ✓ |
| Create/edit Events, Series, Kit Units, Stores, Checklists | | ✓ | ✓ |
| Assign / unassign / Confirm any Duty | | ✓ | ✓ |
| Set own Positions, switch own Playing off/on, report and update own Injuries | ✓ | ✓ | ✓ |
| See Players, everyone's Injuries and duty record; report/update anyone's Injuries; Clear a Concussion | | ✓ | ✓ |
| Reply with own Availability (Players only) | ✓ | ✓ | ✓ |
| Reply for another Player, see Reasons, Announce, Nudge, copy chase message | | ✓ | ✓ |
| Approve, block, unblock Users; change Roles | | | ✓ |

### Blocking

When a User is Blocked:
- Their sessions are revoked and their Feed Token stops working.
- They are taken off their Duties on future Events; a Duty left with nobody on it is flagged to Committee.
- Kit Units they Hold stay with them, flagged "with blocked user".
- Their history (Moves, past Duties) is kept.

## Stores and Venues

- **Store**: name, address, maps link. Managed by Committee. Never hard-deleted (archive).
- **Venues are free text** on each Event and Series (e.g. "Harlington", or an away ground's address), so nobody has to add a record for every away fixture. Venue boxes suggest venues already used; an Event's venue links to a Google Maps search.

## Kit

- **Kit Unit**: name, description (free text of contents), Quantity (default 1), Home (a Store), Kit Status, Condition Note.
- **Quantity** counts interchangeable things that travel separately (8 tackle shields, 2 sets of cones, 3 water bottle carriers) in whatever unit is natural; there is no unit-of-measure field. Counts are hidden when the Quantity is 1. Committee lowers it when some are lost and raises it when more are bought (the extra ones start at Home); both are logged in the Movement Log.
- Kinds of unit include balls/ball bags, tackle shields, cones, bibs, water bottles, physio kit — no fixed category list in v1.
- **Kit Status**: Active / Missing / Retired. Only Active units may be added to a Checklist. Never hard-deleted.
- **Whereabouts** is one or more portions, each a count at exactly one of: a Store, a Holder (User), or Unconfirmed (last seen at an Event). Portion counts add up to the Quantity; a Quantity-1 unit has exactly one portion.
- Any User may record an **ad-hoc Move**: "I've got it" (Holder = me), "give it to [User]" (Holder = another approved User) or "put it in [Store]". For a counted unit it asks how many and from where, defaulting to everything at that place.
- Every Move and every Condition Note change goes in the **Movement Log** (who, what, from, to, when, why — Duty or ad hoc).
- **Kit view**: all Active Kit Units grouped by Whereabouts — each Store, each Holder, then Unconfirmed. A split unit appears in each group with its count there. Missing/Retired in a secondary list.

## Events

- Common fields: title, Event Type, start, end, Venue, notes, Teams (0..n; none = whole club), Cancelled flag.
- **Match** adds: opponent, home/away, competition (BUCS / LUSL / Friendly / Other), Kick-off (= start), Meet Time, Travel Meet Time + travel meet point.
- **Social**: common fields only.
- **Training**: common fields; usually belongs to a Series.
- Type-specific details are held so that new Event Types can add fields without changing existing ones.
- Teams are seeded (1st XV, 2nd XV); Users do not belong to Teams. Everyone sees every Event.
- Events list: Upcoming (default) and Past tabs. Past Events are never deleted.
- **Import from CSV** (Committee): upload a CSV to create many Events at once. The header row is required (column names, any order, optional columns may be left out); dates are `YYYY-MM-DD` or `DD/MM/YYYY`, times 24-hour London; the venue is free text and Teams are matched by name. All or nothing — any bad row means nothing is created and every problem is listed by row. The page offers a downloadable template and a popup describing every column. Up to 500 Events per file.
- **Cancelled** Events stay visible with a clear cancelled marker; their Duties are voided.

### Series

- Defines: title, weekday(s), start/end time, Venue, Teams, start date, **end date** (e.g. end of term), optional Series Checklist.
- Saving a Series creates all its Occurrences immediately (no scheduled job).
- Editing an Occurrence offers **this one** or **this and future**. "This and future" never touches past Occurrences or Occurrences already edited individually (overrides preserved).
- Extending a Series' end date creates the extra Occurrences.
- An Occurrence can be Cancelled individually.

## Checklists and Duties

- **Checklist resolution**: Event Checklist → Series Checklist → Event Type Default Checklist. Committee can edit any level.
- Each Checklist line asks for a count of its Kit Unit: **all of them** by default (kept as "all", so it follows Quantity changes), or a lower number, capped at the Quantity.
- For each Kit Unit on an Event's Checklist there is one **To Duty** and one **From Duty**, each with **zero or more Users**.
- **Claim** (any User) puts you on a Duty — joining anyone already on it. **Assign** (Committee) is a multi-select of Users. Claiming or being assigned the To Duty also puts you on the From Duty by default. Each User can take themselves off or hand their place on to someone else.
- **Destination** of a From Duty defaults to the Kit Unit's Home; editable per Event: another Store, or "stays with the Duty's User".
- **Confirm**:
  - To Duty Confirmed → Move: the count comes "to the Event" (represented as Holder = the Duty's Users).
  - From Duty Confirmed → Move to the Destination (Store, or Holders = the Duty's Users).
  - Any User on the Duty or any Committee member may Confirm, which confirms it for everyone on it.
  - The confirm sheet asks **where they came from** when the Kit Unit is split across places, and **who has how many** when the Duty has several Users and the count is more than 1. Both default (everything from the one place / all with whoever confirms), so a single person carrying a single thing sees no extra step.
- **Unconfirmed**: once an Event has ended, if its From Duty isn't Confirmed, the portion taken there shows Unconfirmed — "last seen at [Event]" (with its count for a counted unit). The app never assumes a Move happened.
- **Clashes** (warnings only, shown on the Event and the Kit Unit) are only about double-booked kit: Events whose times overlap, or are back-to-back without anyone on the From Duty in between, that between them ask for more of a Kit Unit than its Quantity (4 + 4 of 8 shields is fine; 6 + 4 is a Clash).
- **Heads-ups** (gentler warnings, same places) cover the rest:
  - Nobody is taking a Kit Unit to, or back from, an Event that starts within 48h.
  - Kit Unit on a Checklist is Missing/Retired (it was Active when added).
  - Kit Unit's current Holder isn't the person bringing it to the next Event that needs it ("Sam needs to pass Tackle Shields to Tom before Alumni Day"), and the people bringing it can't get enough from Stores and what they already hold. Nothing is said while nobody is bringing it yet.
- **Duty Summary**: "Copy WhatsApp message" button on an Event, producing e.g.

  ```
  🏉 Wed 1 Oct — 1sts & 2nds Training, 19:00, Harlington
  Ball bag A: Tom → / ← Tom
  Tackle shields ×4: Sam & Tom → / ← Priya
  Cones: ❗unassigned
  ```

## Players and Injuries

Lets Committee see at a glance who is fit, helps Players keep track of their own Injuries, and gives a match-day Physio Summary. Built as two features: `players` (Playing, Positions) and `injuries` (Injuries, Fitness, Concussion timeline, Physio Summary).

### Players

- Every approved User is a **Player** unless **Playing** is switched off, by themselves (Profile) or by Committee (the Player's page).
- **Positions**: one **Preferred Position** and any number of **Other Positions**, from: Loosehead Prop (1), Hooker (2), Tighthead Prop (3), Lock (4/5), Blindside Flanker (6), Openside Flanker (7), Number 8 (8), Scrum-half (9), Fly-half (10), Inside Centre (12), Outside Centre (13), Wing (11/14), Fullback (15). Set by the Player; Committee can change them.

### Injuries

- An **Injury** has: body area (Head, Neck, Shoulder, Arm/Elbow, Wrist/Hand, Chest/Ribs, Back, Hip/Groin, Thigh, Knee, Lower leg, Ankle, Foot), a free-text description, the date it happened, optionally the Event it happened at, an optional **Expected Return** date, and an **Injury Status**: Out → Playing through it → Cleared.
- A Player reports and updates their own Injuries; Committee can report and update anyone's. Every status change records who made it and when.
- Injuries are kept as history. One logged in error is marked **Logged by mistake** (by whoever logged it, or Committee) and disappears everywhere, but is never deleted.
- A Player can have several open (not Cleared) Injuries. Their **Fitness** on a date is the worst of them: Out, else Playing through it, else Fit. Fitness is the `injuries` feature's public entry point, ready for a future teamsheet/availability feature.
- **Check-in flags** (for Committee, on the Players list and Player page) are shown on an open Injury whose Expected Return has passed ("Due back 12 Oct — check in"), or that has no Expected Return and has been open over 4 weeks ("Out 5 weeks — check in").

### Concussion

Follows the RFU HEADCASE *Graduated Return to Activity & Sport* (GRAS) programme for community rugby, Aug 2023 ([GRAS programme](https://rfu.widen.net/s/8vnbbhrmpz/gras-programe_aug_2023), [extended guidelines](https://rfu.widen.net/s/rqg8bssfgb/headcase_extended-guidelines_aug_2023)).

- **Concussion** is a flag on an Injury. The day it happened is **Day 0**.
- The Player (or Committee) records a **Symptom-free Date** (no symptoms at rest since). If symptoms come back it is cleared, and the dates below move later.
- The app shows, and never enforces:
  - **Earliest contact training** = the later of Day 15 and Symptom-free Date + 14 days.
  - **Earliest match** = the later of Day 21 and Earliest contact training + 7 days. (The GRAS text only requires 14 symptom-free days before Day 21 or later; we follow its worked example — symptom-free Day 4 → contact Day 18 → match Day 25 — as the safer reading.)
  - Progress, e.g. "Day 9 of at least 21".
  - The six GRAS stages as information, not a checklist: 1 Initial relative rest (24–48h) · 2 Daily & light activity (after at least 24h) · 3 Aerobic & bodyweight (when symptoms allow) · 4 Non-contact rugby & weights (no earlier than Day 8) · 5 Full contact practice (no earlier than Day 15, 14 days symptom-free) · 6 Return to play (no earlier than Day 21).
  - From Day 14 with no Symptom-free Date: "Not improving by day 14? Call NHS 111". From Day 28 still without one: "Still symptoms after 4 weeks? See a GP". Both are also check-in flags for Committee.
- Only Committee can Clear a Concussion; nothing clears automatically.

### Physio Summary

- A "Copy for physio" button on the Players page and on every Match, producing text for WhatsApp, e.g.

  ```
  🩹 Sat 4 Oct — 1st XV v Barts
  Out: Sam Patel — hamstring (since 21 Sep, back ~12 Oct)
  Out: Jo King — concussion (day 9, earliest match 18 Oct)
  Playing through it: Tom Hale — shoulder, strapping
  Cleared this week: Priya Shah — ankle
  ```

- Covers the whole club (Users don't belong to Teams): open Injuries that are Out or Playing through it, and Injuries Cleared in the last 7 days. From the Players page it is headed with today's date instead of a Match.

### Who sees what

- Committee (and Admin) see every Player's Positions, Injuries and duty record.
- A Player sees and edits only their own Positions and Injuries; other Members see nothing of anyone else's.
- Profile tells Players: "Injuries you record are seen by committee."

## Availability

Lets Players say whether they can make a Training or Match, and lets Committee see who's in, who's out and who to chase. A new `availability` feature that references Events by id and contributes a card to Event detail. Replaces the WhatsApp poll and the availability link from the team-selection handover.

### Replies

- Training and Match only (not Social).
- Every Player can reply **Available** (with an optional note, e.g. "late") or **Not available** (a **Reason** is required). A Player who hasn't answered is **No reply** — shown everywhere, because that's who needs chasing.
- A Player can change their reply as often as they like until the Event starts; after that it is read-only. A Cancelled Event keeps its replies but hides the buttons.
- **Double-headers:** a reply to a Match counts for every Match that day (1st XV v Barts and 2nd XV v UCL are one answer).
- **Committee can reply for a Player** (told in person, in the pub…), shown as "set by Tom". A Reason is still required for Not available. The Player's own next reply replaces it.
- **Reasons** are seen only by Committee and the Player; everyone sees who is Available / Not available.
- Users with Playing off see the card read-only and are left out of counts and lists. Their old replies are kept and come back if Playing is switched on again. Replies are never deleted.

### Announce and Nudge

- **Announce** (Committee), once per Event: emails every Player with No reply, with an optional **Reply By** date and time. The card then shows "Announced 12 Sep by Tom" and the Reply By; anyone replying after it is marked "late" (nothing is enforced). Announcing a Match covers every Match that day in one email.
- **Nudge** (Committee): emails everyone with No reply, or the ones ticked. Asks to confirm ("Nudge 9 people?"), no limit; each Player shows "nudged 2h ago".
- Emails link to the Event page; no one-click answering, no opt-out (switching Playing off stops them). Subject e.g. "Can you make it? Sat 4 Oct — 1st XV v Barts".
- **Copy chase message**: WhatsApp text listing who hasn't replied, e.g.

  ```
  🏉 Sat 4 Oct — 1st XV v Barts
  Still need a reply from: Sam Patel, Jo King, Tom Hale
  Can you make it? https://app.imrfc.co.uk/events/…
  ```

### Sharing

- **Share** button on every Event (native share sheet on phones, copy link otherwise).
- Link previews (WhatsApp etc.) show only the Event's title and date — no Venue, no names — served without sign-in.

### Where it shows

- **Event detail:** an Availability card — your reply buttons, counts ("12 in · 3 out · 8 haven't said"), and Available / Not available / No reply tabs listing names (notes, "set by", "late", and Reasons for Committee). Committee also get Announce / Nudge / Copy chase message. Colours from the theme only: solid tick for Available, destructive red for Not available, dashed outline for No reply.
- **Home:** a "Can you make it?" card for announced Events you haven't replied to; answer inline (Not available opens a sheet for the Reason). It disappears once you reply.
- **Player page** (Committee): this season's record, one line each for Matches and Training ("Matches: available 9 · not 3 · no reply 2").

### Not yet

- Scheduled (automatic) Announce a set time before an Event.
- Emails when an announced Event changes or is Cancelled.
- When Injuries arrive, Committee see "Out · hamstring" beside a name in the lists; a reply is never set automatically from Fitness.

## Calendar Feed

- Each User has a private ICS URL containing a Feed Token; they can reset it.
- Contains all Events (Cancelled ones marked `STATUS:CANCELLED`) with the User's own Duties in the description ("You're bringing: Ball bag A", "You're bringing: Tackle shields ×4 with Sam").
- Blocked Users' feeds return 404/410.

## Screens (mobile-first)

- **Bottom tabs**: Members get Home · Kit · Profile; Committee and Admin get Home · Kit · Players · Admin · Profile. There is no Events tab: the What's coming up title on Home links to Events (with a chevron), which keeps Past events and CSV import.
- **Home**: "Can you make it?" for announced Events I haven't replied to, my Duties (upcoming, soonest first), next few Events, Kit Units I Hold, and a card for each of my open Injuries ("Hamstring — out since 21 Sep · Update").
- **Events**: Upcoming / Past lists → Event detail (details, maps link, Share, **Availability** for Training and Matches, Clashes, **Who's bringing what**, Duty Summary button). Who's bringing what has one row per Kit Unit on the Checklist with its Whereabouts, a Bring slot and a Take back slot (who, done or not, gold for yours, "Needs someone" within 48h) and its heads-ups. Tapping a slot opens a sheet with only the actions the viewer may take (claim, mark as done, hand on / give it to someone from a tap-a-name list, where it goes back to, take someone off).
- **Kit**: grouped by Whereabouts → Kit Unit detail (Whereabouts, Condition Note, upcoming Duties, Movement Log, "I've got it", then "give it to someone" and "put it away in [Store]" below it).
- **Admin** (Committee/Admin sections as permitted): Pending Users, Users & Roles, Stores, Kit Units, Event Types & Default Checklists, Series.
- **Players** (Committee): a summary line ("3 out · 2 playing through it"), name search, an Injured-only filter, Players in position order (by Preferred Position) each with their Fitness, main Injury ("Out · ankle (+1)") and check-in flag, then a collapsed **Not playing** section. "Copy for physio" button.
- **Player page** (Committee): name, Preferred and Other Positions, Playing switch; Fitness and open Injuries (with the Concussion timeline); Injury history; Duties — upcoming, this season's count (1 Sep–31 Aug: "12 done · 2 never confirmed", Cancelled Events left out) and the last 5 past Duties, each done or never confirmed; this season's Availability record. Actions: report an Injury, update status, edit Positions.
- **Profile**: name, a **Playing** section (Playing switch, Positions, my open Injuries and history with the same Concussion timeline, report an Injury, the privacy line), Calendar Feed URL (copy/reset), sign out.
- PWA manifest + icons (installable via "Add to Home Screen" on iOS/Android) — nice-to-have, last slice.

## Look and feel

- **"Clubhouse" look:** warm, minimal neutrals; editorial serif headings (Instrument Serif, one weight, never bolded) with Inter Tight for everything else; generous space; large rounded cards. Tailwind + shadcn/ui. All colours come from one theme file of CSS tokens (`src/app/globals.css`).
- **No app name in the UI.** The crest ([docs/brand/crest.png](docs/brand/crest.png), white background, always on a white round tile) sits top-right of Home and above the signed-out screens. On Home it is also the **colour theme menu**: System (default) / Light / Dark, saved on the User and applied as `<html data-theme>`.
- **The crest's colours are accents only:** gold marks what is yours (Your Duty markers, the active tab dot, the "With you" Kit group); navy marks your next Duty and Matches.
- **Home:** greeting ("Evening, Ollie."), Your duties as small 2-up cards (the next one navy), then **What's coming up** with Calendar and Agenda tabs; its title (with a chevron) links to Events. Events uses the same Calendar/Agenda view, plus Past events.
- **Calendar:** a month grid where every Event is readable in its day (name wraps to three lines, then its time); Training, Match and Social have distinct colours; your Duties get a gold edge. Tap a day to select it and see its Events; Committee tap again (or an empty day) to quick-add an Event, Google-Calendar style.
- **Copy sounds like a teammate talking**, not the system: plain sentences about who is doing what ("Nobody is taking Tackle Shields to Alumni Day", "You've got: Cones & Ball Bag", "Tom gave it to Priya"). Domain terms stay the same words but go lower-case in running text ("claim a duty", "no events yet"); never build possessives or labels from them ("Tackle Shields's To Duty", "Holder has no To Duty").

| Token | Light | Dark |
|---|---|---|
| background / card | `#F5F4F0` / `#FFFFFF` | `#11100F` / `#1B1A18` |
| text / muted text | `#111111` / `#66645D` | `#F3F1EC` / `#A19D93` |
| primary (buttons) | near-black `#111111` | off-white `#F3F1EC` |
| accent (gold, yours) | `#F2C400` with near-black text | same |
| lead (your next Duty) | navy `#1F2F55` | `#24365F` |
| Training / Match / Social | `#EBE9E3` / `#1F2F55` / `#FBEAA3` | `#2A2825` / `#34497F` / `#4A3D0B` |
| destructive | `#B3151D` | `#FF6B70` |

Every signed-in screen is checked with axe in light, dark (device) and Dark chosen on a light device (`e2e/design.spec.ts`).

## Technology

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript, pnpm |
| DB | Postgres — Neon (prod), Docker (dev), PGlite (tests) |
| ORM | Drizzle |
| Auth | Better Auth: Google, magic link, admin plugin (ban/unban) — see [ADR 0001](docs/adr/0001-better-auth-and-neon-over-supabase.md) |
| Email | Pluggable mail sender: Mailpit (dev), console (tests), SMTP from `noreply@imrfc.co.uk` (prod). One Announce reaches 50–100 Players, so the production sender's free tier must allow ~300 emails/day (Resend's free tier is believed to be 100/day — check; Brevo is ~300/day) |
| UI | Tailwind, shadcn/ui |
| Tests | Vitest (unit + integration on PGlite), Playwright (E2E) |
| Hosting | Vercel (`lhr1`) at `app.imrfc.co.uk`, Neon Postgres (London); DNS at IONOS |

### Architecture

Code is organised **by feature**, not by layer. Each feature owns its domain rules in plain TypeScript, independent of Next.js, which makes them testable in isolation and lets new features attach without editing existing ones. See [ADR 0002](docs/adr/0002-feature-modules.md).

Features: `users` (access, roles, blocking), `locations`, `kit` (units, whereabouts, moves), `events` (events, series, teams), `duties` (checklists, duties, confirm, clashes, summary), `calendar-feed`, `players` (Playing, Positions), `availability` (replies, Announce, Nudge, chase message), `selection` (planned: selection board, team sheets), `injuries` (Injuries, Fitness, Concussion timeline, Physio Summary).

## Out of scope for v1

- Duty reminders (email / push), scheduled Announce, and emails when an Event changes or is Cancelled.
- Fixture import (BUCS/LUSL scraping or calendar import).
- Itemised kit contents (e.g. counting the balls inside a ball bag). Quantity counts things that travel separately, not what's inside a container.
- Team-filtered Calendar Feeds, team membership.
- Multiple clubs.
- Committee-only comments on Players (e.g. punctuality) — dropped.
- Phone numbers / "Message on WhatsApp" links on the Player page.
- Injury reminders, filtering the Physio Summary by Team, ticking off GRAS stages.

## Extensions

**Availability** (see [Availability](#availability)) is the reference extension and the test of the architecture: a new `availability` feature that references Events by id and adds UI to the Event detail page, with no changes to the `events` feature's rules. Keep Event detail composed of slots that features can contribute to.

**Selection** comes next, bringing in the team-selection system another committee member built (selection board with two pitches coloured by reply, click a shirt to see who can play there, drag to pick; team sheets with Default fields and match-day roles, as PDF and Word). It joins as a `selection` feature that asks `availability`'s entry point for each Player's reply to a Match and `players` for Positions, and later `injuries` for Fitness (and could then narrow the Physio Summary to a match's squad). To be grilled before it is built — open questions include a shared board with live updates between admins and how PDFs are produced on free hosting.

Other planned extensions: duty reminders (email/web push — iOS supports push for installed PWAs), fixture import, team-filtered feeds, itemised kit contents.

## Open items

- Enable Docker Desktop → Settings → Resources → WSL integration for this distro (needed for `pnpm dev`, not for tests).
