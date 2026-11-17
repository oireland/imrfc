# The Movement Log is the ledger; Portions are a view kept in step with it

Every change to an Equipment Unit's Whereabouts appends one Movement Log entry (`added`, `bought`, `lost`, `move`, `unconfirmed`, plus `opening` from migration 0037). A unit's Portions are what you get by applying its entries in `seq` order (`replay` in `equipment/ledger.ts`). `equipment_portion` stays as a table so reads are one cheap query, and `appendToLedger` updates it in the same transaction as the log insert, under the unit lock. Property tests replay the ledger after every step and require the same counts at the same Places.

## Decisions

- **Migration took a balance, not a rewrite of history (L5).** Old units lack `added` entries, old Unconfirmed changes weren't logged and some old `lost` entries don't say where from, so their logs can't replay. Migration 0037 writes one `opening` entry per Portion (no user) as the balance at migration time, and replay starts at the latest run of opening entries, ignoring older history (kept for the history page). Working back from today's Portions through the old log would have meant guessing at the missing facts.
- **Order is a `seq` identity column**, not `created_at`: every entry in one transaction shares the same `now()`. `created_at` is `timestamptz` so it compares with `duty.confirmed_at`.
- **Ledger entries have no foreign key to an Event.** An entry records the last-seen Event id as plain text, because replay must still work after an Admin deletes an Event for good, and a log entry must never block or be cascaded by that. The live `equipment_portion.last_seen_event_id` does have a foreign key, so an Event can't be deleted while equipment is still last seen there.
- **User is nullable only where nobody acted:** `unconfirmed` (time passing), `added` stock of unknown source and `opening`. A check constraint enforces that.

## Considered options

- **Full event sourcing, no portions table:** every read replays entries. Simplest to reason about, but Home and Equipment read Whereabouts for every unit, and the query budgets (L2) leave no room. Rejected for the kept view.
- **Keep deleting and re-inserting Portions, with the log as a side record (the old design):** nothing forced the two to agree, and they drifted. Rejected.
- **Portions as a materialised view or trigger-built table:** hides the rules in SQL, and PGlite tests would need to cover the triggers. Rejected: the rules stay in plain TypeScript.
- **Foreign key from entries to Events:** would block hard-deleting an Event, or force cascades that erase history. Rejected, see above.

## Consequences

- Any new way of changing Whereabouts goes through `appendToLedger`; writing `equipment_portion` directly is a bug.
- Unconfirmed could now be derived from the ledger, which would retire the page-load write in ADR 0006. Not done yet.
