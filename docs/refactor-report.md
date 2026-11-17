# Refactor report: what's left

_First written 17 Nov 2026 from a read-through of `src/` that looked for duplication, over-engineering and leftovers from bug fixes. Trimmed the same day after the None and Low-risk items landed on `refactor/low-risk-tidy`; [refactor-progress.md](refactor-progress.md) records what was done. This file now lists only the suggestions still open. Item numbers are kept from the first version so the progress record still lines up._

**Goal:** make the codebase easier for a person to find their way around, without changing what the app does. Every item has a **Correctness** note saying what could break and how to check it.

## How to use this

- Each item is sized so one session can pick it up on its own. The table gives the order I'd do them in.
- "Lines" is a rough estimate of production code removed, not counting tests. Read it as an order of magnitude.
- Follow the repo's working rules. Run `pnpm test`, `pnpm typecheck` and `pnpm lint` after each item. For anything touching Confirm or locks, also run `pnpm test:pg`. Most items are refactors, so the existing tests are the safety net. Where a behaviour moves somewhere new, move its test with it.

## Summary

| # | Item | Lines | Risk | Touches |
|---|------|------:|------|---------|
| 9 | [Portions maths lives in the ledger only](#9-portions-maths-lives-in-the-ledger-only) | ~50 | Medium | `equipment/portions.ts`, `index.ts` |
| 10 | [One email-delivery tracker, not two](#10-one-email-delivery-tracker-not-two) | ~200 | Medium | availability, selection, 2 API routes, 2 components |
| 15 | [Duty actions go through `actOnDuty` only](#15-duty-actions-go-through-actonduty-only) | ~40 | Medium | `duties/index.ts`, tests |
| 16 | [`ensureDuties` becomes private](#16-ensureduties-becomes-private-after-15) | ~10 | Low, after #15 | `duties/index.ts` |
| 20 | [Event detail page: move the view model out](#20-event-detail-page-move-the-view-model-out) | ~0 net, −250 in the page | Medium | `events/[id]/page.tsx`, `event-duties.tsx` |
| 21 | [Equipment detail page: one Portion label](#21-equipment-detail-page-one-portion-label) | ~15 | Low, changes copy | `equipment/[id]/page.tsx` |
| 22 | [Profile and Player page actions](#22-profile-and-player-page-actions) | ~40 | Low | profile, players, users |
| 23 | [Remaining leftovers](#23-remaining-leftovers) | ~10 | None | users, `lib/utils.ts`, onboarding |
| 24 | [Cascade deletes inside a feature](#24-cascade-deletes-inside-a-feature-optional) | ~25 | Medium (migration) | duties, injuries, checklists, events |
| 25 | [Derive Unconfirmed from the ledger](#25-later-derive-unconfirmed-from-the-ledger) | large | High | out of scope for now |

---

## Equipment and the ledger

### 9. Portions maths lives in the ledger only

**Where.** "Take `count` away from one Place" is written three times:

- `ledger.ts` `debit` is the real one, used by `appendToLedger` and `replay`.
- `portions.ts` `moveMultiple`.
- `portions.ts` `lowerQuantity`, imported into `equipment/index.ts` as `lowerQuantityRule`.

Since L4, production code only uses `moveMultiple` and `lowerQuantity` for their **checks**. `recordSplitMove` throws away the portions `moveMultiple` returns, and the private `lose` helper throws away the portions `lowerQuantityRule` returns. `appendToLedger` then applies the entries again through `applyEntry`, which repeats the per-Place check.

**How.**

- Replace `moveMultiple` with a small `checkSplitMove({ sources, targets }, portions)`. It does only what `applyEntry` can't:
  - whole-number counts;
  - `sourceTotal === targetTotal` ("What's being moved doesn't add up.");
  - each source's total against `countAt` ("There aren't N there to move.").

  Then append the flows.
- Replace the `lowerQuantity` rule with `checkLower(portions, removeCount, from)`. It returns either the Place to debit or an error: below 1, "Choose where to lower it from.", or "There aren't N there to remove."
- `ledger.debit` stays the only code that changes counts.

**Correctness.** This one needs care:

- **Keep the per-source check before pairing.** `pairFlows(...).filter(!samePlace)` drops no-op flows, so a source paired with itself is never debited. Today `moveMultiple` still rejects that request if the Place doesn't hold enough. If only `applyEntry` checked, the request would quietly succeed.
- **Tests pin the messages.** `portions.test.ts` and `equipment/index.test.ts` assert the exact strings and counts. `applyEntry` would report the per-flow count, not the per-source count, which is why the source check must stay up front.
- `portions.property.test.ts` and `ledger.property.test.ts` cover the maths. Move the cases that target `moveMultiple` onto `checkSplitMove` plus `applyEntry`.

---

## Two copies of the same feature

### 10. One email-delivery tracker, not two

**Where.** Two features each built the same machinery, line for line: availability (Announce and Nudge) and selection (Name the team and Send changes). It sends emails after the response, tracks who was reached, retries or dismisses failures, and polls for progress.

| Piece | Availability | Selection |
|---|---|---|
| Table | `availability_ask` | `selection_notice` |
| Status for the UI | `askNotice` (`availability/index.ts`) | `noticeStatus` (`selection/naming.ts`) |
| Deliver loop | `deliverAsk` | `deliverNotice` |
| Retry | `retryAsk` | `retryNotice` |
| Dismiss | `dismissAsk` | `dismissNotice` |
| Get one | `getAsk` | `getNotice` |
| Poll route | `api/asks/[id]/route.ts` | `api/notices/[id]/route.ts` |
| Client poller | `watchAsk` (`availability-card.tsx`) | `watchNotice` (`name-the-team.tsx`) |
| Failure line and `failedMessage` | `AskLine` in `availability-card.tsx` | inline in `name-the-team.tsx` |

Both share two rules: a send cut off before it finished counts everyone not reached as missed, and a retry sets `createdAt = now` and clears `finishedAt` and `missedIds`. Both `askNotice` and `noticeStatus` already take a `name(id)` function, and the shared `joinList` (`lib/join-names.ts`) is already in place.

**How (code only, no schema change).**

- Add a pure `src/lib/delivery.ts`, written once against the shape `{ createdAt, finishedAt, reachedIds, missedIds, recipientIds }`:
  - `deliveryStatus(row, now)` wraps `askStatus` and the cut-off rule.
  - `deliveryProgress(row, nameOf, now)` returns `{ status, total, sent, missed[] }`.
- Add a generic `deliverEach(recipients, alreadyReached, sendOne)`. It runs the try/catch loop and returns who was reached. Each feature keeps its own email wording and its own `update … set reachedIds, missedIds, finishedAt`.
- Move `askStatus` out of availability, so `selection/naming.ts` stops importing it from `@/features/availability`.
- On the client, use one `watchDelivery(url, id, { sent, failed }, refresh)` and one `<DeliveryLine>` component in both cards.
- Keep the two API routes, because they check different permissions. Each body shrinks to about three lines.

**Further option (schema change, decide separately).** Replace both tables with one `outbound_notice` table whose `kind` is `announce | nudge | name | changes`. That removes a table and a route, but it means a data migration on two live tables, so I'd stop at the code-only version.

**Correctness.** The two copies differ in small ways. Keep each difference:

- Availability's recipients are `playerIds: string[]`, while selection's are `recipients: { userId, kind, shirt }[]`. The shared code works on ids, and each feature maps to and from them.
- `deliverAsk` also inserts `availability_nudge` rows for a nudge.
- The success toasts are worded differently: "Announced. Emailed N people." vs "Told N people."

The delivery and retry tests in `availability/index.test.ts` and `selection/index.test.ts` cover this, as does `e2e/notifications.spec.ts`.

---

## Duties

### 15. Duty actions go through `actOnDuty` only

**Where.** `actOnDuty` (`duties/index.ts`) loads the Duty and its People and asks `dutyActions` whether the request is allowed. It then calls `claimDuty`, `leaveDuty`, `handOnDuty`, `assignDuty` or `setDestination`. Each of those loads the Duty and its People **again** and repeats checks that `dutyActions` already made:

- `claimDuty`: "You're already on it." (`dutyActions` only offers `claim` when the viewer isn't on it.)
- `leaveDuty`: "You're not on that duty." (Only offered when on it.)
- `setDestination`: "Only the trip back has a destination." (Only offered on a From Duty.)
- `handOnDuty`: "You can only hand on your own place." (Only offered when on it.)

In production, the five functions are only reached through `actOnDuty`. Tests and `src/test/season.ts` call them directly.

**How.** Make the five functions private and pass them the loaded `row` and `userIds`. That removes five lookups and four branches that can no longer be reached. Keep the checks `dutyActions` can't make: "They're already on it." and the Approved check in `handOnDuty` and `assignDuty`. Move the tests and `season.ts` onto `actOnDuty` (or `actOnEventDuty`) with a viewer, which also tests the path the app really uses.

**Correctness.** `confirmDuty` must keep its own checks: `voidedAt`, nobody on it, `confirmedAt`, and the claim inside the transaction. The concurrency fix (L1) relies on them, so leave `confirmDuty` exported as it is. Most of the work is in the tests: about 60 direct calls across these files:

- `duties/index.test.ts`
- `event-duties.test.ts`
- `ledger.property.test.ts`
- `confirm.pg.test.ts`
- `push/index.test.ts`
- `calendar-feed/index.test.ts`
- `account-deletion/index.test.ts`
- `src/test/season.ts`

A test helper `claim(db, dutyId, userId)` that calls `actOnDuty` keeps that change mechanical.

### 16. `ensureDuties` becomes private (after #15)

The rest of the duties tidy-ups are done. `ensureDuties` is still exported, but in production only `actOnEventDuty` calls it. Once #15 is done, it can become a private "insert the pair if missing, then load the one row" inside `actOnEventDuty`, and the tests that call it go through `actOnEventDuty` instead.

**Correctness.** The existing duties tests cover this.

---

## The app layer

### 20. Event detail page: move the view model out

**Where.** `src/app/(app)/events/[id]/page.tsx` is about 500 lines. Roughly lines 225–350 build `DutyEquipment[]` and `KitEditing` from duties, portions, stores and people. That is domain logic in a route, against the repo's "routes are thin adapters" rule. It covers:

- when to ask for a source (`needsSourceChoice`) and the source options;
- when to ask "who has how many", and its default (all with the viewer, otherwise the first person);
- the "Tom has it from Sam" label, with its has/have grammar;
- the encoding of the destination value;
- several slightly different "name or You/you/Someone/someone" helpers: `personName`, `nameOf`, `namesOf`, `affectedNames`, and the inline `uid === user.id ? "You" : …`, which appears three times. The page keeps its own `personName` Map rather than `loadNames` from `users` because of the lower-case fallbacks.

The page also defines five server actions inline: `cancel`, `remove`, `edit`, `act` and `addKit`. It also has the `refuseListChange` and `unitsOnlyOnOwnList` helpers.

**How.**

- Move the view-model code into a plain `dutySheets({ viewerId, committee, units, duties, portions, stores, name, … })` in `src/app/(app)/events/[id]/duty-view.ts`. It must have no Next.js imports, so it can be unit-tested. Alternatively, put it in the `duties` feature if the rules should live there. Use one `who(uid, { capitalised })` helper, built on `nameLookup` from `users`.
- Pass the destination to `event-duties.tsx` as a structured `DutyDestination` instead of a hand-built `"store:<id>"` string that the component parses again in `toDestination`. Source options already use `placeKey` and `parsePlaceKey` from `equipment/client.ts`.
- Move the server actions to `events/[id]/actions.ts`, the way `equipment/actions.ts` already works. The list actions share the same shape: `refuseListChange`, then act, then `revalidatePath`.

**Correctness.** This moves code rather than deleting it, so the risk is in getting the moved text exactly right. The e2e specs `duty-sheet`, `shared-duties`, `confirm`, `kit-list` and `equipment-hand-over` exercise this page. Add a unit test of the extracted function for the `holderOptions` default and the has/have label, since nothing below e2e covers them today.

### 21. Equipment detail page: one Portion label

The rest of #21 is done. The Portion label is still written three ways on `equipment/[id]/page.tsx`:

- the `PortionActions` heading: "in X", "with Y" or "not confirmed — last seen at Z", with an optional "N " prefix;
- the quantity "which ones?" options: a bare store name, a capitalised person, or "Not confirmed";
- `describeWhereabouts`, which gives "In X", or "N at X" when split.

**How.** Use `describeWhereabouts([portion], names)` for the single-Portion case, or add one `portionLabel(portion, names, { capitalised })` next to it in `equipment/whereabouts.ts` with a test.

**Correctness.** This was skipped because merging them **changes visible copy**: capitalisation, and "N at X" instead of "N in X". Decide the wording first, checking it against the screens and the glossary in `CONTEXT.md`. Then update `e2e/equipment-hand-over.spec.ts` and `equipment-quantity.spec.ts` if they match on the text.

### 22. Profile and Player page actions

The rest of #22 is done. `savePositions`, `saveMobileNumber` and `togglePlaying` are still each written twice inline, once on the Profile page and once on the Player page. The only differences are the permission check and the paths they revalidate.

**How.** Move them to an `actions.ts` that takes `userId`, with permissions checked in the feature the way `setMobileNumber` already does with `actor`. That would match `away-actions.ts` and `injury-actions.ts`.

**Correctness.** `setPlayerPositions` (players) and `setPlaying` (users, re-exported by players) need an actor parameter, and their tests in `players/index.test.ts` and `users/index.test.ts` move with them. Keep the permission rules exactly as they are: a player edits their own, and the Committee edits anyone's.

---

## Leftovers

### 23. Remaining leftovers

| What | Where | Notes |
|---|---|---|
| `setRole`, `blockUser` | `users/index.ts` | Only `changeRole` and `blockUserAs` use them in production. They stay exported because `users/index.test.ts` and `calendar-feed/index.test.ts` import them. Move those tests onto `changeRole` and `blockUserAs`, then make both functions private. |
| `lib/utils.ts` | `src/lib/utils.ts` | It only re-exports `cn`, and every file now imports `cn` from `"cn"` directly. Delete it and point `components.json` `aliases.utils` at `"cn"`, after checking that the shadcn CLI accepts a package name there. Otherwise keep it, so `shadcn add` keeps working. |
| `features/onboarding` | whole folder | One five-line pure function plus a re-export. It could live in `users` as `needsOnboarding`. Optional, because ADR 0002 prefers new features to edits. |

### 24. Cascade deletes inside a feature (optional)

**Where.** In several places, deleting a parent and its own child rows takes two statements and a select of ids:

- `duty` → `duty_user` (`deleteDuties`)
- `injury` → `injury_change` (`clearInjuries`)
- `checklist` → `checklist_item` (`clearChecklist`)
- `event` → `match_details` (`deleteEvent`)

**How.** Add a migration that puts `ON DELETE CASCADE` on those four **feature-internal** foreign keys. Each delete then becomes one statement.

**Correctness.** Don't touch the foreign keys that point at `event` from other features. `src/db/event-foreign-keys.test.ts` deliberately pins them as `NO ACTION`, and ADR 0007 relies on `equipment_portion.last_seen_event_id` blocking a delete. `event-foreign-keys.test.ts` leaves `match_details` out of its check, so it won't object. Make the migration with `drizzle-kit generate` (as `0038_seed-teams` was) so the snapshots stay consistent. Because it's a schema change, it sits low in the list.

### 25. Later: derive Unconfirmed from the ledger

ADR 0006 and ADR 0007 both say this is now possible. Replaying the Movement Log against Duty and Event state would replace:

- `markUnconfirmed` (about 70 lines) and `markUnconfirmedOnce`;
- `setUnconfirmed`;
- the writer for the `unconfirmed` entry kind;
- the exception that allows a write on page load.

It is the largest simplification left, but it changes how Clashes, Whereabouts and Confirm read Unconfirmed portions. It's a feature-sized change that needs its own ADR, not a refactor, so it's listed here for completeness only.

---

## What I looked at and left alone

- **The ledger design** (`appendToLedger`, `replay`, `seq`, the opening entries): it's recent, documented in ADR 0007 and covered by property tests. I found no cheaper equivalent.
- **`clashes-rules.ts` and `heads-up-rules.ts`**: dense, but each line carries a rule from SPEC.
- **`email-layout.ts`**: long because email HTML needs inline styles. Nothing else duplicates it.
- **`architecture/feature-boundaries.ts`**: small, and it earns its keep.
- **The large client components** (`availability-card.tsx`, `event-duties.tsx`, `selection-board.tsx`, `coming-up.tsx`): their size is mostly markup for distinct sheets. Apart from the delivery-progress duplication (#10) and the destination parsing (#20), I found no copies worth merging. Splitting each into a file per sheet would make them easier to navigate without removing code. That's a judgement call for whoever next works in them.
- **Migrations and `drizzle/meta` snapshots**: generated, so never hand-edited.
