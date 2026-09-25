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
- Profile: name and email only (from the sign-in provider; name editable).
- **Roles** are club-wide and cumulative:

| Capability | Member | Committee | Admin |
|---|:-:|:-:|:-:|
| View Events, Kit, Duties, Movement Log | ✓ | ✓ | ✓ |
| Claim a Duty, Confirm own Duty, hand own Duty on | ✓ | ✓ | ✓ |
| Record an ad-hoc Move, edit Condition Note | ✓ | ✓ | ✓ |
| Create/edit Events, Series, Kit Units, Locations, Checklists | | ✓ | ✓ |
| Assign / unassign / Confirm any Duty | | ✓ | ✓ |
| Approve, block, unblock Users; change Roles | | | ✓ |

### Blocking

When a User is Blocked:
- Their sessions are revoked and their Feed Token stops working.
- Their Duties on future Events are unassigned and flagged to Committee.
- Kit Units they Hold stay with them, flagged "with blocked user".
- Their history (Moves, past Duties) is kept.

## Locations

- Name, address, maps link, flags `isVenue` / `isStore` (at least one).
- Managed by Committee. Never hard-deleted (archive).

## Kit

- **Kit Unit**: name, description (free text of contents), Home (a Store), Kit Status, Condition Note.
- Kinds of unit include balls/ball bags, tackle shields, cones, bibs, water bottles, physio kit — no fixed category list in v1.
- **Kit Status**: Active / Missing / Retired. Only Active units may be added to a Checklist. Never hard-deleted.
- **Whereabouts** is exactly one of: a Store, a Holder (User), or Unconfirmed (last seen at an Event).
- Any User may record an **ad-hoc Move**: "I've got it" (Holder = me) or "put it in [Store]".
- Every Move and every Condition Note change goes in the **Movement Log** (who, what, from, to, when, why — Duty or ad hoc).
- **Kit view**: all Active Kit Units grouped by Whereabouts — each Store, each Holder, then Unconfirmed. Missing/Retired in a secondary list.

## Events

- Common fields: title, Event Type, start, end, Venue, notes, Teams (0..n; none = whole club), Cancelled flag.
- **Match** adds: opponent, home/away, competition (BUCS / LUSL / Friendly / Other), Kick-off (= start), Meet Time, Travel Meet Time + travel meet point.
- **Social**: common fields only.
- **Training**: common fields; usually belongs to a Series.
- Type-specific details are held so that new Event Types can add fields without changing existing ones.
- Teams are seeded (1st XV, 2nd XV); Users do not belong to Teams. Everyone sees every Event.
- Events list: Upcoming (default) and Past tabs. Past Events are never deleted.
- **Cancelled** Events stay visible with a clear cancelled marker; their Duties are voided.

### Series

- Defines: title, weekday(s), start/end time, Venue, Teams, start date, **end date** (e.g. end of term), optional Series Checklist.
- Saving a Series creates all its Occurrences immediately (no scheduled job).
- Editing an Occurrence offers **this one** or **this and future**. "This and future" never touches past Occurrences or Occurrences already edited individually (overrides preserved).
- Extending a Series' end date creates the extra Occurrences.
- An Occurrence can be Cancelled individually.

## Checklists and Duties

- **Checklist resolution**: Event Checklist → Series Checklist → Event Type Default Checklist. Committee can edit any level.
- For each Kit Unit on an Event's Checklist there is one **To Duty** and one **From Duty**.
- **Claim** (any User) or **Assign** (Committee) a To Duty → the From Duty goes to the same User by default. Either Duty can then be handed to someone else.
- **Destination** of a From Duty defaults to the Kit Unit's Home; editable per Event: another Store, or "stays with the Duty's User".
- **Confirm**:
  - To Duty Confirmed → Move: Whereabouts becomes "at Event" (represented as Holder = the Duty's User).
  - From Duty Confirmed → Move to the Destination (Store, or Holder = the Duty's User).
  - The Duty's User or any Committee member may Confirm.
- **Unconfirmed**: once an Event has ended, if its From Duty isn't Confirmed, the Kit Unit's Whereabouts shows Unconfirmed — "last seen at [Event]". The app never assumes a Move happened.
- **Clashes** (warnings only, shown on the Event and the Kit Unit):
  - Kit Unit on the Checklists of two Events whose times overlap or are back-to-back without a From Duty in between.
  - Kit Unit's current Holder has no To Duty for an upcoming Event that needs it.
  - Kit Unit on a Checklist is Missing/Retired (it was Active when added).
  - Duty unfilled within 48h of the Event.
- **Duty Summary**: "Copy WhatsApp message" button on an Event, producing e.g.

  ```
  🏉 Wed 1 Oct — 1sts & 2nds Training, 19:00, Harlington
  Ball bag A: Tom → / ← Tom
  Tackle shields: Sam → / ← Priya
  Cones: ❗unassigned
  ```

## Calendar Feed

- Each User has a private ICS URL containing a Feed Token; they can reset it.
- Contains all Events (Cancelled ones marked `STATUS:CANCELLED`) with the User's own Duties in the description ("You're bringing: Ball bag A").
- Blocked Users' feeds return 404/410.

## Screens (mobile-first)

- **Home**: my Duties (upcoming, soonest first), next few Events, Kit Units I Hold.
- **Events**: Upcoming / Past lists → Event detail (details, maps link, Checklist with To/From Duties, Clashes, Duty Summary button).
- **Kit**: grouped by Whereabouts → Kit Unit detail (Whereabouts, Condition Note, upcoming Duties, Movement Log, "I've got it" / "Put in store").
- **Admin** (Committee/Admin sections as permitted): Pending Users, Users & Roles, Locations, Kit Units, Event Types & Default Checklists, Series.
- **Profile**: name, Calendar Feed URL (copy/reset), sign out.
- PWA manifest + icons (installable via "Add to Home Screen" on iOS/Android) — nice-to-have, last slice.

## Look and feel

- **"Clubhouse" look:** warm, minimal neutrals; editorial serif headings (Instrument Serif, one weight, never bolded) with Inter Tight for everything else; generous space; large rounded cards. Tailwind + shadcn/ui. All colours come from one theme file of CSS tokens (`src/app/globals.css`).
- **No app name in the UI.** The crest ([docs/brand/crest.png](docs/brand/crest.png), white background, always on a white round tile) sits top-right of Home and above the signed-out screens. On Home it is also the **colour theme menu**: System (default) / Light / Dark, saved on the User and applied as `<html data-theme>`.
- **The crest's colours are accents only:** gold marks what is yours (Your Duty markers, the active tab dot, the "With you" Kit group); navy marks your next Duty and Matches.
- **Home:** greeting ("Evening, Ollie."), Your duties as small 2-up cards (the next one navy), then **What's coming up** with Calendar and Agenda tabs. Events uses the same Calendar/Agenda view, plus Past events.
- **Calendar:** a month grid where every Event is readable in its day (name wraps to three lines, then its time); Training, Match and Social have distinct colours; your Duties get a gold edge. Tap a day to select it and see its Events; Committee tap again (or an empty day) to quick-add an Event, Google-Calendar style.

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
| Email | Pluggable mail sender: Mailpit (dev), console (tests), club Gmail over SMTP with an app password (prod) — the club has no domain, so Resend is out |
| UI | Tailwind, shadcn/ui |
| Tests | Vitest (unit + integration on PGlite), Playwright (E2E) |
| Hosting | Vercel (later) |

### Architecture

Code is organised **by feature**, not by layer. Each feature owns its domain rules in plain TypeScript, independent of Next.js, which makes them testable in isolation and lets new features attach without editing existing ones. See [ADR 0002](docs/adr/0002-feature-modules.md).

Features: `users` (access, roles, blocking), `locations`, `kit` (units, whereabouts, moves), `events` (events, series, teams), `duties` (checklists, duties, confirm, clashes, summary), `calendar-feed`.

## Out of scope for v1

- Availability / RSVPs (WhatsApp polls suffice for now).
- Email / push reminders.
- Fixture import (BUCS/LUSL scraping or calendar import).
- Itemised kit contents (e.g. counting individual balls).
- Team-filtered Calendar Feeds, team membership.
- Multiple clubs.

## Extensions

**Availability / RSVP** is the reference extension and the test of the architecture: it should be addable as a new `availability` feature that references Events by id and adds UI to the Event detail page, with no changes to the `events` feature's rules. Keep Event detail composed of slots that features can contribute to.

Other planned extensions: duty reminders (email/web push — iOS supports push for installed PWAs), fixture import, team-filtered feeds, itemised kit contents.

## Open items

- Create the club Gmail account for sending magic links (needed at deploy, not locally).
- Enable Docker Desktop → Settings → Resources → WSL integration for this distro (needed for `pnpm dev`, not for tests).
