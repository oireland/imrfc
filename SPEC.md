# IMRFC Club Hub — Specification (v1)

Capitalised domain terms are defined in [CONTEXT.md](CONTEXT.md). Build order is in [PLAN.md](PLAN.md).

## Problem

Imperial Medicals RFC keeps forgetting equipment and keeps asking the same questions on WhatsApp: *when is training, where is the ball bag, who's bringing the shields?* There is no single place for upcoming Events, no record of where Equipment Units are, and no clear owner for carrying equipment to and from each Event.

## Goals

1. One place to see every upcoming and past Event.
2. Always know each Equipment Unit's Whereabouts.
3. Every Equipment Unit an Event needs has a named person bringing it (To Duty) and taking it away (From Duty).
4. Nobody from outside the club gets in.
5. Easy to extend — Availability/RSVP is the reference extension (see [Extensions](#extensions)).

## Constraints

- Free to build and run: Next.js on Vercel (hobby), Neon Postgres (free), no paid services — push notifications use the free Web Push standard rather than a third-party push service.
- Mobile-first; most use is on phones. ~50–150 users.
- Single club, single tenant. All times Europe/London (BST-aware).
- Built test-first (TDD). Vercel deployment only once fully working locally.

## Access

- Sign in with **Google** or **magic link** (email).
- New Users start **Pending** and see only a "Waiting for approval" screen.
- Admins see a pending-count badge and approve or block from the Admin area. No approval emails in v1.
- Emails in the `ADMIN_EMAILS` env var become Admin automatically on first sign-in.
- Profile: name and email (from the sign-in provider; name editable), plus a Preferred Position set during onboarding and an optional Mobile number (see [Contact](#contact)).
- **Onboarding**: a new User (blank name, or no Preferred Position yet) — or a User with Playing on and no Mobile number — sees a dismissible modal asking for their name, Preferred Position and Mobile number, with a short guide to what each tab does. "Not now" delays it for that browser tab; it reappears next time the app is opened in a new tab or session until completed.
- Following a link while signed out (e.g. an Event shared in the group chat) goes through sign-in — Google or magic link — and lands back on that page. Only same-site paths are accepted. A new User who lands on "Waiting for approval" goes to Home once approved.
- **Roles** are club-wide and cumulative:

| Capability | Member | Committee | Admin |
|---|:-:|:-:|:-:|
| View Events, Equipment, Duties, Movement Log | ✓ | ✓ | ✓ |
| Claim a Duty, Confirm own Duty, hand own Duty on | ✓ | ✓ | ✓ |
| Record an ad-hoc Move, edit Condition Note | ✓ | ✓ | ✓ |
| Create/edit Events, Series, Equipment Units, Stores, Checklists | | ✓ | ✓ |
| Assign / unassign / Confirm any Duty | | ✓ | ✓ |
| Set own Positions, switch own Playing off/on, report and update own Injuries, add and end own time Away | ✓ | ✓ | ✓ |
| See Players, everyone's Injuries, time Away and duty record; report/update anyone's Injuries and time Away; Clear a Concussion | | ✓ | ✓ |
| Reply with own Availability (Players only) | ✓ | ✓ | ✓ |
| Reply for another Player, see Reasons, Announce, Nudge, copy chase message | | ✓ | ✓ |
| Approve, block, unblock Users; change Roles | | | ✓ |
| Delete an Event for good (with its Duties, replies and team picks) | | | ✓ |
| Delete own account | ✓ | ✓ | ✓ |
| Delete anyone else's account, except another Admin's | | | ✓ |

### Blocking

When a User is Blocked:
- Their sessions are revoked and their Feed Token stops working.
- They are taken off their Duties on future Events; a Duty left with nobody on it is flagged to Committee.
- Equipment Units they Hold stay with them, flagged "with blocked user".
- Their history (Moves, past Duties) is kept.

### Deleting an account

Any User can delete their own account from Profile; an Admin can delete anyone's from Admin → Users, except another Admin's. It can't be undone:
- Their name, email, Positions, Mobile number and sign-in methods are wiped and their sessions end. The User stays in the database as **Deleted user** so the club's history (Moves, past Duties, Availability replies) still reads; they drop out of Users, Players and Availability lists.
- The email is freed: signing in with it again starts a new Pending account.
- They are taken off their Duties on future Events; their Feed Token and Push subscriptions are removed.
- Equipment Units they Hold stay with "Deleted user", flagged on the Equipment view, until someone moves them.

## Stores and Venues

- **Store**: name, address, maps link. Managed by Committee. Never hard-deleted (archive).
- **Venues are free text** on each Event and Series (e.g. "Harlington", or an away ground's address), so nobody has to add a record for every away fixture. Venue boxes suggest venues already used; an Event's venue links to a Google Maps search.

## Equipment

- **Equipment Unit**: name, description (free text of contents), Quantity (default 1), Home (a Store), Equipment Status, Condition Note.
- **Quantity** counts interchangeable things that travel separately (8 tackle shields, 2 sets of cones, 3 water bottle carriers) in whatever unit is natural; there is no unit-of-measure field. Counts are hidden when the Quantity is 1. Committee lowers it when some are lost and raises it when more are bought (the extra ones start at Home); both are logged in the Movement Log.
- Kinds of unit include balls/ball bags, tackle shields, cones, bibs, water bottles, physio equipment — no fixed category list in v1.
- **Equipment Status**: Active / Missing / Retired. Only Active units may be added to a Checklist. Never hard-deleted.
- **Whereabouts** is one or more portions, each a count at exactly one of: a Store, a Holder (User), or Unconfirmed (last seen at an Event). Portion counts add up to the Quantity; a Quantity-1 unit has exactly one portion.
- Any User may record an **ad-hoc Move**: "I've got it" (Holder = me), "give it to [User]" (Holder = another approved User) or "put it in [Store]". For a counted unit it asks how many and from where, defaulting to everything at that place.
- Every Move and every Condition Note change goes in the **Movement Log** (who, what, from, to, when, why — Duty or ad hoc).
- **Equipment view**: all Active Equipment Units grouped by Whereabouts — each Store, each Holder, then Unconfirmed. A split unit appears in each group with its count there. Missing/Retired in a secondary list.

## Events

- The form starts with the **Event Type**, which decides the rest. Common fields: Event Type, start, end, Venue, notes, Cancelled flag. The type is chosen when an Event is created and fixed afterwards.
- **Titles are derived**, except a Social's: a Training is "Training @ Venue" and a Match is "Team vs Opponent" (e.g. "1st XV vs St Georges"). The title is stored and re-derived whenever the Event is edited.
- **Training**: common fields; always for the whole club (no Team); usually belongs to a Series.
- **Match**: Team playing (exactly one, required), opponent, home/away, Venue, date, then **Kick-off, Meet Time (at the venue) and Transport Meet Time**, each a time or **TBC**, then competition (BUCS / LUSL / Friendly / Other) and the transport meet point. There is no end time: a Match runs two hours from Kick-off, or covers the whole day while Kick-off is TBC (the calendar shows "TBC", the Calendar Feed an all-day entry). Meet Time and Transport Meet Time start as TBC and display "TBC" for home and away Matches alike. Notify the team lists any that are still TBC among the things missing (Transport only for an away Match).
- **Social**: its own title, plus the common fields; for the whole club (no Team).
- Type-specific details are held so that new Event Types can add fields without changing existing ones.
- Teams are seeded (1st XV, 2nd XV); Users do not belong to Teams. Only a Match has a Team. Everyone sees every Event.
- Events list: Upcoming (default) and Past tabs. Past Events are cancelled or, by an Admin only, deleted for good.
- **Import from CSV** (Committee): upload a CSV to create many Events at once. The header row is required (column names, any order, optional columns may be left out); dates are `YYYY-MM-DD` or `DD/MM/YYYY`, times 24-hour London; the venue is free text and a Match's team is matched by name. A Training or Match is titled from its details, so a `title` column is only read for Socials. For a Match, `team` and `opponent` are required, the kick-off (`start_time`) and the meet times can be `TBC` or blank, and `end_time` is ignored. All or nothing — any bad row means nothing is created and every problem is listed by row. The page offers a downloadable template and a popup describing every column. Up to 500 Events per file.
- **Cancelled** Events stay visible with a clear cancelled marker; their Duties are voided.

### Series

- Defines: weekday(s), start/end time, Venue, start date, **end date** (e.g. end of term), optional Series Checklist. A Training Series has no title of its own (its Occurrences are "Training @ Venue"); a Social Series is titled by hand.
- Saving a Series creates all its Occurrences immediately (no scheduled job).
- Editing an Occurrence offers **this one** or **this and future**. "This and future" never touches past Occurrences or Occurrences already edited individually (overrides preserved).
- Extending a Series' end date creates the extra Occurrences.
- An Occurrence can be Cancelled individually.

## Checklists and Duties

- **Checklist resolution**: Event Checklist → Series Checklist → Event Type Default Checklist. Committee can edit any level.
- **Editing a Checklist**: the first change to a level that has none (add, remove, or a new count) starts from a copy of the list it was using, so nothing already on it is lost. On an Event, Committee edit it from Who's bringing what: an Edit toggle shows Edit (count) and Remove on each line, and Add equipment at the foot opens a sheet. Taking an Equipment Unit off an Event's Checklist drops its Duties; if anyone is on them it asks first. Default and Series lists use the same controls with no Duties.
- Each Checklist line asks for a count of its Equipment Unit: **all of them** by default (kept as "all", so it follows Quantity changes), or a lower number, capped at the Quantity.
- For each Equipment Unit on an Event's Checklist there is one **To Duty** and one **From Duty**, each with **zero or more Users**.
- **Claim** (any User) puts you on a Duty — joining anyone already on it. **Assign** (Committee) is a multi-select of Users. Claiming or being assigned the To Duty also puts you on the From Duty by default. Each User can take themselves off or hand their place on to someone else.
- **Destination** of a From Duty defaults to the Equipment Unit's Home; editable per Event: another Store, or "stays with the Duty's User".
- **Confirm**:
  - To Duty Confirmed → Move: the count comes "to the Event" (represented as Holder = the Duty's Users).
  - From Duty Confirmed → Move to the Destination (Store, or Holders = the Duty's Users).
  - Any User on the Duty or any Committee member may Confirm, which confirms it for everyone on it.
  - The confirm sheet asks **where they came from** when the Equipment Unit is split across places, and **who has how many** when the Duty has several Users and the count is more than 1. Both default (everything from the one place / all with whoever confirms), so a single person carrying a single thing sees no extra step.
- **Unconfirmed**: once an Event has ended, if its From Duty isn't Confirmed, the portion taken there shows Unconfirmed — "last seen at [Event]" (with its count for a counted unit). The app never assumes a Move happened.
- **Clashes** (warnings only, shown on the Event and the Equipment Unit) are only about double-booked equipment: Events whose times overlap, or are back-to-back without anyone on the From Duty in between, that between them ask for more of an Equipment Unit than its Quantity (4 + 4 of 8 shields is fine; 6 + 4 is a Clash).
- **Heads-ups** (gentler warnings, same places) cover the rest:
  - Nobody is taking an Equipment Unit to, or back from, an Event that starts within 48h.
  - Equipment Unit on a Checklist is Missing/Retired (it was Active when added).
  - Equipment Unit's current Holder isn't the person bringing it to the next Event that needs it ("Sam needs to pass Tackle Shields to Tom before Alumni Day"), and the people bringing it can't get enough from Stores and what they already hold. Nothing is said while nobody is bringing it yet.
- **Duty Summary**: "Copy WhatsApp message" button on an Event, producing e.g.

  ```
  🏉 Wed 1 Oct — 1sts & 2nds Training, 19:00, Harlington
  Ball bag A: Tom → / ← Tom
  Tackle shields ×4: Sam & Tom → / ← Priya
  Cones: ❗unassigned
  ```

## Players and Injuries

Lets Committee see at a glance who is fit, helps Players keep track of their own Injuries, and gives a match-day Physio Summary. Built as two features: `players` (Playing, Positions, time Away) and `injuries` (Injuries, Fitness, Concussion timeline, Physio Summary).

### Players

- Every approved User is a **Player** unless **Playing** is switched off, by themselves (Profile) or by Committee (the Player's page).
- **Positions**: one **Preferred Position** and any number of **Other Positions**, from: Loosehead Prop (1), Hooker (2), Tighthead Prop (3), Lock (4/5), Blindside Flanker (6), Openside Flanker (7), Number 8 (8), Scrum-half (9), Fly-half (10), Inside Centre (12), Outside Centre (13), Wing (11/14), Fullback (15). Set by the Player; Committee can change them.

### Time away

For a Player who is fit but won't be playing for a while (exams, a holiday), so Committee don't chase them and the app doesn't bug them. Lives in `players`, not `injuries`: it is not medical and never appears in Fitness or the Physio Summary.

- An **Away** period has a **from** date (default today), an **until** date and a **Reason** (required). Both dates are required, so it ends by itself; nobody is stuck Away.
- A Player adds, edits and ends their own from Profile; Committee can do the same for anyone from the Player page (shown as "set by Tom"). A Player can have several, future ones included.
- **I'm back** ends a current period early (until becomes yesterday). A period still in the future, or added by mistake, can be removed; past periods are kept as history, shown to Committee on the Player page ("Away 3 Nov – 20 Nov, exams") and to the Player on Profile. Nothing is hard-deleted.
- Seen only by the Player and Committee; the Reason is seen only by Committee and the Player. Other Members never see who is away.
- What Away does to chasing is under [Availability → Not chased](#not-chased).

### Injuries

- An **Injury** has: body area (Head, Neck, Shoulder, Arm/Elbow, Wrist/Hand, Chest/Ribs, Back, Hip/Groin, Thigh, Knee, Lower leg, Ankle, Foot), a free-text description, the date it happened, optionally the Event it happened at, an optional **Expected Return** date, and an **Injury Status**:
  - **Out** — can't train or play.
  - **Training only** — might still come to training, can't play Matches.
  - **Playing through it** — will play, still carrying it.
  - **Cleared** — over.
- **Needs physio at games** is a tick on Training only and Playing through it (not Out), with an optional note on what they need ("strapping on the right ankle"). It feeds the Physio Summary.
- **Expected Return** is asked for on the report form with a **Not sure yet** chip beside it, so skipping is a visible choice. Once it has passed, the Home card asks "Still expecting 12 Oct?" (no email or push).
- A Player reports and updates their own Injuries; Committee can report and update anyone's. Every status change records who made it and when.
- One **Update** sheet (from the Profile card, the Home card or the Player page) holds the whole flow: a Status picker where any status can follow any other (people get worse as well as better), Expected Return with Not sure yet, Needs physio and its note, and an optional progress note shown in the history. **Cleared** and **Logged by mistake** are separate actions at the foot of the sheet.
- Injuries are kept as history. One logged in error is marked **Logged by mistake** (by whoever logged it, or Committee) and disappears everywhere, but is never deleted.
- A Player can have several open (not Cleared) Injuries. Their **Fitness** on a date is the worst of them: Out, else Training only, else Playing through it, else Fit. Fitness is the `injuries` feature's public entry point, ready for a future teamsheet/availability feature.
- **Check-in flags** (for Committee, on the Players list and Player page) are shown on an open Injury whose Expected Return has passed ("Due back 12 Oct — check in"), or that has no Expected Return and has been open over 4 weeks ("Out 5 weeks — check in", or "Training only 5 weeks…" for the status it is in).
- **Committee push** (see [Notifications](#notifications)) when a Player reports an Injury or moves to a worse status, and when time Away starts within 14 days.

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
  Training only: Ali Reid — knee (back ~15 Oct)
  Playing through it: Tom Hale — shoulder (needs physio: strapping)
  Cleared this week: Priya Shah — ankle
  ```

- Covers the whole club (Users don't belong to Teams): open Injuries that are Out, Training only or Playing through it (with the Needs physio note), and Injuries Cleared in the last 7 days. From the Players page it is headed with today's date instead of a Match.

### Who sees what

- Committee (and Admin) see every Player's Positions, Injuries, time Away and duty record.
- A Player sees and edits only their own Positions, Injuries and time Away; other Members see nothing of anyone else's.
- Profile tells Players: "Injuries and time away you record are seen by committee."

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

### Not chased

Away, Out and Training only players aren't nagged for Events they won't be at. Based on the Event's date and type:

| State on the Event's date | Training | Matches |
|---|---|---|
| Away | not chased | not chased |
| Out | not chased | not chased |
| Training only | chased | not chased |
| Playing through it, Fit | chased | chased |

- **Not chased** means skipped by Announce, Nudge, the Message on WhatsApp sheet, the Home "Can you make it?" card and the morning-of push, and not counted in "haven't said" or the No reply tab or chase message.
- They appear instead in an **Away / Injured** group on the Availability card ("2 away · 1 injured") with the cause (the Reason and Injury detail for Committee only), so Committee see why a name is missing.
- A reply always wins: if they reply Available they are shown as Available and drop out of the group; Not available likewise. Nothing is ever set automatically from Away or Fitness.
- Committee can still tick a Not chased Player by hand in a Nudge.
- Needs: `availability` asks `players` (Away) and, from slice 21, `injuries` (Fitness) through their entry points, so the table is built in two stages: Away first, Fitness after.

### Announce and Nudge

- **Announce** (Committee), once per Event: emails every Player with No reply, with an optional **Reply By** date and time. The card then shows "Announced 12 Sep by Tom" and the Reply By; anyone replying after it is marked "late" (nothing is enforced). Announcing a Match covers every Match that day in one email.
- **Nudge** (Committee): emails everyone with No reply, or the ones ticked. Asks to confirm ("Nudge 9 people?"), no limit; each Player shows "nudged 2h ago".
- Both send in the background: Send closes the sheet straight away, then a toast says how it went. If anyone wasn't reached, Committee see "Tom's nudge didn't reach Jo and Sam" on the card until one of them dismisses it.
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
- **Player page** (Committee): this season's record, one line each for Matches and Training ("Matches: available 9 · not 3 · no reply 2"), each with a second line counting only the announced ones ("Announced only: available 5 · not 1 · no reply 0"). Past Events this season that weren't Cancelled; a day's Matches count once.

### Not yet

- Scheduled (automatic) Announce a set time before an Event.
- Emails when an announced Event changes or is Cancelled.

## Contact

Lets Committee message a Player personally on WhatsApp — harder to ignore than the group chat. A new `contact` feature that owns each User's **Mobile number** and builds WhatsApp links; `availability` and the Player page use its entry point.

### Mobile number

- Optional, one per User. Entered as `07…` (taken as UK) or a full international `+…` number; validated and stored as E.164 (`+447…`) with `libphonenumber-js`. It can be cleared.
- Set by the User on **Profile** ("Only Committee see this — it's so they can message you about availability"), by Committee on the **Player page**, and in **Onboarding**: a User with Playing on and no Mobile number sees the onboarding modal until they add one or choose "Not now".
- Seen only by Committee and the User themselves. Wiped when the account is deleted.

### Message on WhatsApp

- WhatsApp is opened with an official click-to-chat link (`https://wa.me/<number>?text=<message>`), in a new tab, the same on every device. The app never sends anything itself: you press send in WhatsApp, from your own number. No WhatsApp API and no automation of a personal account (the Business API sends from a business number; unofficial automation risks a ban).
- **Player page** (Committee): the Mobile number and a WhatsApp button that opens the chat with no message.
- **Availability card** (Committee): **Message on WhatsApp** beside Nudge, any time before the Event starts (hidden when Cancelled; a Match covers every Match that day). It opens a sheet of everyone with No reply (Blocked and Deleted Users never appear); those with no Mobile number are greyed out with "No number".
- Each row's **WhatsApp** button opens the chat prefilled with e.g. `Hi Sam, can you make Sat 4 Oct (1st XV v Barts)? Let us know on the app: https://app.imrfc.co.uk/events/…` (first name, Event date and title, link). Opening the chat records nothing — the app can't know whether the message was sent.
- When you come back to the app, the row you opened asks "Sent it?" with a **Sent ✓** button; Sent ✓ stays on every row so a message sent another way can be marked too. Only Sent ✓ records **Messaged** (who and when, per Event), shown as "messaged 2h ago by Tom" beside "nudged" in the No reply tab and the sheet. The record is kept after the Player replies.

## Selection

Lets Committee pick each Match's team on a shared board, turn it into the club's Team Sheet, and notify the team to the Players. A new `selection` feature that reads each Player's Availability from `availability`'s entry point and Positions from `players`, references Events by id, and contributes a Team card to Event detail. Replaces the selection board and team sheets from the team-selection handover (one local copy per selector, PDF and Word); Word is dropped.

### Selection board

- **One shared board per match day**, with a pitch for each Match that day (a lone Match gets one pitch). Only Committee can pick. Reached from a Match's Event detail ("Pick the team", `/events/[id]/selection`), opening on that Match's pitch.
- Each pitch is drawn as a rugby pitch with **Shirts** 1–15 in formation (back three at the top, front row at the bottom), and the **Subs** (16–23) as a list below it. Empty Shirts are allowed; **Add a shirt** at the foot of the bench adds 24, 25… for a bigger squad (e.g. a friendly), and an empty extra Shirt can be removed. Extras are per Match.
- Every picked person is coloured by their Availability, theme colours only: solid for Available, destructive red and crossed out for Not available, dashed outline for No reply.
- **Tap a Shirt** to open a list of everyone Playing, sorted for that Shirt: Preferred Position matches, then Other Positions that match, then the paired position as cover (Blindside ↔ Openside Flanker for 6/7, Inside ↔ Outside Centre for 12/13), then everyone else. Lock covers 4 and 5, Wing 11 and 14. Anyone can be picked; someone outside the first three groups is flagged **out of position** on the Shirt.
- Picking someone Not available or with No reply is allowed, with a warning; a pick is never removed automatically when a reply changes.
- **Guests**: Committee can type a name onto a Shirt for someone who isn't a User (a ringer, a fresher on day one). A Guest lives on that Selection only: no reply, no Positions, no history, never notified.
- Picking a Player already on the other pitch that day **moves** them, leaving their old Shirt empty, with a toast ("Moved from 2nd XV 12").
- **One pitch at a time at every width, with a tab per Match** (1st and 2nd XV on the same day). Tap a Shirt and tap a name to pick; a filled Shirt also offers Roles, **Swap** (then tap the other Shirt) and Empty. On wider screens names can also be dragged between Shirts, dropping on a filled Shirt to swap.
- **Two selectors at once**: every Shirt saves on its own (the last change to a Shirt wins), and an open board refreshes every ~5 seconds. A Shirt changed by someone else flashes ("Tom moved this"). No realtime service.
- Past and Cancelled Matches show the board read-only.

### Team Sheet

- The club's pre-match sheet, made from a Match's Selection, with a live preview beside the fields (below them on a phone) and a **PDF** download generated in code (`@react-pdf/renderer`, so it runs on Vercel's free plan with no browser on the server). Layout as the handover's example: the details in a header, then one row per filled Shirt (number, name, Match Day Roles); empty Shirts don't print.
- **From the Event**, overridable on the sheet only (never written back to the Event): title ("IMRFC 1st XV vs Imperial 2nd XV"), Kick-off, Meet (from Meet Time / Travel Meet Time, free text so it can say "8.30am coach from SK or 8.45am coach from Hammersmith") and Location (the Venue). Kick-off keeps following the Event unless overridden.
- A free-text **Schedule** line ("Changing Rooms 10.15am, Warmup 10.30am").
- **Sheet Defaults**, kept per Team: Travel Attire, Warm Up Attire, Post Match Activity and the message ("Congratulations on your selection to represent IMRFC 1s…"). Each has a Default tick: use the default, override for this Match, or save the new value as the default. Typed once on first use; nothing is imported.
- **Match Day Roles**, from a fixed list, given only to people on that sheet (Guests included): Leadership C (captain), VC (vice captain) — at most one each; Match Day LM (linesman), HT (hydration technician), NT (nutrition technician), SGC (shower gel captain), KD (kit duty) — any number. One person can hold several ("C, KD"). The sheet prints the legend. KD is set by hand, even though it usually matches whoever takes home the team's kit.
- **What's missing**, listed above Notify the team: empty starting Shirts, picked Players who are Not available or have No reply, no C. It warns, never blocks.

### Notify the team

- **Notify the team** (Committee), per Match, so each side goes when it is ready. Confirms with what's missing ("Notify the team with 2 things missing?"). The board then shows "Notified Tue 30 Sep by Tom".
- Everyone on the sheet, bench included (not Guests), gets an email and a Push notification ("You're in the 1st XV for Sat 4 Oct"), sent in the background with the same "didn't reach" warning as Nudge.
- **After naming**, edits are held as unsent changes ("2 changes not sent yet") until Committee tap **Send changes**, which tells only the people affected: added, moved Shirt, or dropped ("You're no longer in the 1st XV team for Sat 4 Oct").
- If a picked Player replies Not available after the team is named, Committee get a Push notification ("Sam can't make Saturday — at 4 for the 1st XV"). Before naming it only shows on the board.

### Where it shows

- **Event detail** (Matches): once named, a **Team** card is the first thing under the Event's details, for every signed-in User — the Team Sheet's details, Shirts, names and Match Day Roles, and the PDF download. Committee also get "Pick the team" (before and after naming).
- **Home**: a "You're playing Saturday · 7 for the 1st XV" card (or "on the bench · 19") for a named Player until the Match; gone if the Match is Cancelled.

### Not yet

- Telling the team when a named Match is Cancelled or its time changes.
- Word Team Sheets; importing the handover's squad, teams or defaults.
- Filling KD from who takes the team's kit; a "selected" count on the Player page; Fitness on the board (comes with Injuries).

## Calendar Feed

- Each User has a private ICS URL containing a Feed Token; they can reset it.
- Contains all Events (Cancelled ones marked `STATUS:CANCELLED`) with the User's own Duties in the description ("You're bringing: Ball bag A", "You're bringing: Tackle shields ×4 with Sam").
- Blocked Users' feeds return 404/410.

## Notifications

The app is a PWA (manifest, icons, installable via "Add to Home Screen"), which enables
push notifications — no paid service, using the Web Push standard (see [ADR 0004](docs/adr/0004-web-push-over-third-party-and-daily-cron-drift.md)).

- **Notifications** toggle on Profile turns push on/off for that browser/device; off by default. Turning it on asks the browser for permission and subscribes that device.
- **Morning-of**: once a day, a User with a Duty (To or From) on an Event starting today, or who replied Available to today's Training/Match, gets one push summarising why ("You're on duty for Training", or combined if more than one reason applies).
- **Announce / Nudge**: alongside the existing email, a User Announce or Nudge reaches also gets a matching push.
- **Injuries and Away** (to Committee and Admin with Notifications on, never the person who made the change): a new Injury, a change to a worse Injury Status (including Out), and a new Away period that starts within 14 days. Text gives the name and the new state only, because push shows on lock screens: "Jo King is now Out", "Jo King is now Training only", "Jo King is away until 3 Nov" / "Jo King will be away from 20 Dec". No body area, description or Reason. No push for getting better, Cleared, or a far-future Away; the Players list covers those. Sent in the background, one per change.
- Tapping a notification opens the app to the relevant page: the Event for Event pushes, the Player's page for Injury and Away pushes.

## Screens (mobile-first)

- **Bottom tabs**: Members get Home · Events · Equipment · Profile; Committee and Admin get Home · Events · Equipment · Players · Admin · Profile. The What's coming up title on Home also links to Events (with a chevron).
- **Home**: "Can you make it?" for announced Events I haven't replied to, "You're playing" for a named team I'm in, my Duties (upcoming, soonest first), next few Events, Equipment Units I Hold, a card for each of my open Injuries ("Hamstring — out since 21 Sep · Update", or "Still expecting 12 Oct?" once that has passed), and an Away card while I am Away ("You're away until 3 Nov · I'm back"). These health cards are only ever my own (nobody else's Injuries or Away appear on Home, Committee included; they use the Players tab and push). They sit in one **stack**: collapsed it shows the top card with two card edges behind it and a "+2 more" badge; tapping the top card opens them all, and "Show less" folds them back. Order, most urgent first: an Injury with a passed Expected Return ("Still expecting…?"), then Out, Training only, Playing through it, then the Away card (current period only; a future one stays on Profile until it starts). Cleared and Logged by mistake Injuries leave Home.
- **Events**: Upcoming (the Calendar / Agenda view with an All · Training · Matches · Socials filter; the Agenda lists every upcoming Event) and Past events, plus CSV import → Event detail (details, the **Team** card once a Match's team is named, maps link, Share, **Availability** for Training and Matches, Clashes, **Who's bringing what**, Duty Summary button). Who's bringing what has one row per Equipment Unit on the Checklist with its Whereabouts, a Bring slot and a Take back slot (who, done or not, gold for yours, "Needs someone" within 48h) and its heads-ups. Tapping a slot opens a sheet with only the actions the viewer may take (claim, mark as done, hand on / give it to someone from a tap-a-name list, where it goes back to, take someone off).
- **Equipment**: grouped by Whereabouts → Equipment Unit detail (Whereabouts, Condition Note, upcoming Duties, Movement Log, "I've got it", then "give it to someone" and "put it away in [Store]" below it).
- **Admin** (Committee/Admin sections as permitted): Pending Users, Users & Roles, Stores, Equipment Units, Event Types & Default Checklists, Series.
- **Players** (Committee): a summary line ("3 out · 1 training only · 2 playing through it · 2 away", non-zero parts only), name search that updates as you type (debounced, no Enter needed), a Position filter (Preferred or Other Position), **Injured** and **Away** filter chips, a small **New** dot on anyone with an Injury or Away added or changed in the last 48 hours, Players alphabetical by name by default (position order, by Preferred Position, as an alternative sort) each with their Fitness, main Injury ("Out · ankle (+1)"), check-in flag and, if Away, "Away until 3 Nov" (or "from 20 Dec"; Away Players stay in their place in the list, not under Not playing), then a collapsed **Not playing** section. "Copy for physio" button.
- **Player page** (Committee): name, Preferred and Other Positions, Playing switch; Fitness and open Injuries (with the Concussion timeline); Injury history; time Away (current, future and past); Duties — upcoming, this season's count (1 Sep–31 Aug: "12 done · 2 never confirmed", Cancelled Events left out) and the last 5 past Duties, each done or never confirmed; this season's Availability record. Actions: report an Injury, update status, add time Away on their behalf, edit Positions.
- **Profile**: name, a **Playing** section (Playing switch, Positions, my open Injuries and history with the same Concussion timeline, my time Away (add, edit, I'm back, past periods), report an Injury, the privacy line), Calendar Feed URL (copy/reset), a **Notifications** toggle (see [Notifications](#notifications)), sign out.

## Look and feel

- **"Clubhouse" look:** warm, minimal neutrals; editorial serif headings (Instrument Serif, one weight, never bolded) with Inter Tight for everything else; generous space; large rounded cards. Tailwind + shadcn/ui. All colours come from one theme file of CSS tokens (`src/app/globals.css`).
- **No app name in the UI.** The crest ([docs/brand/crest.png](docs/brand/crest.png), white background, always on a white round tile) sits top-right of Home and above the signed-out screens. On Home it is also the **colour theme menu**: System (default) / Light / Dark, saved on the User and applied as `<html data-theme>`.
- **The crest's colours are accents only:** gold marks what is yours (Your Duty markers, the active tab dot, the "With you" Equipment group); navy marks your next Duty and Matches.
- **Home:** greeting ("Evening, Ollie."), Your duties as small 2-up cards (the next one navy), then **What's coming up** with Calendar and Agenda tabs and the same All · Training · Matches · Socials filter as Events; its title (with a chevron) links to Events. Events uses the same view, plus Past events. The tab and filter are in the URL (`?view=agenda&type=match`) so either can be bookmarked.
- **Agenda** (and the selected day's list under the Calendar): each Training and Match shows your reply ("You're in · Change" / "You're out · Change") or, if you haven't replied and still can, I'm in / I'm out buttons; I'm out asks why, as on Event detail.
- **Calendar:** a month grid where every Event is readable in its day (name wraps to three lines, then its time); Training, Match and Social have distinct colours; your Duties get a gold edge. Tapping a day selects it and scrolls down to its list of Events; it never opens anything. Committee add an Event with the **Add** button beside that day's heading, which opens the New event sheet on that date.
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
| Fitness: Out tint / Training only (text, tint) / Playing through it (text, tint) | `#F8E1E2` / `#9A5200`, `#FBE8D0` / `#1F2F55`, `#E1E6F3` | `#3A1517` / `#F0A55A`, `#3A2812` / `#9DB2EA`, `#223052` |

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

Features: `users` (access, roles, blocking), `locations`, `equipment` (units, whereabouts, moves), `events` (events, series, teams), `duties` (checklists, duties, confirm, clashes, summary), `calendar-feed`, `players` (Playing, Positions, time Away), `availability` (replies, Announce, Nudge, chase message, Messaged), `contact` (Mobile numbers, WhatsApp links), `selection` (Selection board, Team Sheets, Notify the team), `injuries` (Injuries, Fitness, Concussion timeline, Physio Summary).

## Out of scope for v1

- Duty reminders (email / push), scheduled Announce, and emails when an Event changes or is Cancelled.
- Fixture import (BUCS/LUSL scraping or calendar import).
- Itemised equipment contents (e.g. counting the balls inside a ball bag). Quantity counts things that travel separately, not what's inside a container.
- Team-filtered Calendar Feeds, team membership.
- Multiple clubs.
- Committee-only comments on Players (e.g. punctuality) — dropped.
- Injury reminders, filtering the Physio Summary by Team, ticking off GRAS stages.

## Extensions

**Availability** (see [Availability](#availability)) is the reference extension and the test of the architecture: a new `availability` feature that references Events by id and adds UI to the Event detail page, with no changes to the `events` feature's rules. Keep Event detail composed of slots that features can contribute to.

**Contact** (see [Contact](#contact)) is a small feature with a public entry point for the Mobile number and WhatsApp links; `availability` and `players` call it, and Onboarding asks it whether a number is missing.

**Selection** (see [Selection](#selection)) follows the same pattern: a `selection` feature that asks `availability`'s entry point for each Player's reply and `players` for Positions, and later `injuries` for Fitness (which could then narrow the Physio Summary to a Match's team).

Other planned extensions: duty reminders (email/web push — iOS supports push for installed PWAs), fixture import, team-filtered feeds, itemised equipment contents.

## Open items

- Enable Docker Desktop → Settings → Resources → WSL integration for this distro (needed for `pnpm dev`, not for tests).
