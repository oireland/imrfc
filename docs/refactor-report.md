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
| 20 | [Event detail page: move the view model out](#20-event-detail-page-move-the-view-model-out) | ~0 net, −250 in the page | Medium | `events/[id]/page.tsx`, `event-duties.tsx` |
| 23 | [Remaining leftovers](#23-remaining-leftovers) | ~10 | None | `lib/utils.ts`, onboarding |
| 25 | [Derive Unconfirmed from the ledger](#25-later-derive-unconfirmed-from-the-ledger) | large | High | out of scope for now |

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

---

## Leftovers

### 23. Remaining leftovers

| What | Where | Notes |
|---|---|---|
| `lib/utils.ts` | `src/lib/utils.ts` | It only re-exports `cn`, and every file now imports `cn` from `"cn"` directly. Delete it and point `components.json` `aliases.utils` at `"cn"`, after checking that the shadcn CLI accepts a package name there. Otherwise keep it, so `shadcn add` keeps working. |
| `features/onboarding` | whole folder | One five-line pure function plus a re-export. It could live in `users` as `needsOnboarding`. Optional, because ADR 0002 prefers new features to edits. |

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
- **The large client components** (`availability-card.tsx`, `event-duties.tsx`, `selection-board.tsx`, `coming-up.tsx`): their size is mostly markup for distinct sheets. Apart from the destination parsing (#20), I found no copies worth merging. Splitting each into a file per sheet would make them easier to navigate without removing code. That's a judgement call for whoever next works in them.
- **Migrations and `drizzle/meta` snapshots**: generated, so never hand-edited.
