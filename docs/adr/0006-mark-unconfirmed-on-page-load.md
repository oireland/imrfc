# Marking Unconfirmed runs on the Home and Equipment page loads

Rendering a page changes nothing, with one exception. Home and Equipment call `markUnconfirmed` before they read Whereabouts. It finds Equipment Units whose Event has ended, whose To Duty was Confirmed and whose From Duty was not, and records them as Unconfirmed. Event detail used to create missing Duties on render. It now derives blank Duties on read (`listEventDuties`) and only creates rows when someone acts.

Unconfirmed is caused by time passing, not by a person doing something. Nothing happens at the moment an Event ends, so no mutation is there to hang it on. The daily cron (`/api/cron/morning-of`) also runs it, but the Hobby plan allows one cron a day (ADR 0004). Without the page-load call, Whereabouts would show the old Holder for up to a day after an Event ends.

It is safe to run on a read. It is idempotent, and when there is nothing to mark it makes one read query and writes nothing. A test in `duties/index.test.ts` and the write check in `query-budget.test.tsx` both pin that down.

## Considered options

- **Derive Unconfirmed on read:** the honest fix, with nothing stored. Rejected for now. Unconfirmed is a stored portion state that Clashes, Whereabouts and Confirm all read, and L4 and L5 are reworking the ledger those portions come from. Deriving it today means changing every reader, then again after the ledger lands.
- **A more frequent cron:** marks Unconfirmed within minutes. Needs a paid Vercel plan, which breaks "free to build and run".
- **`after()`:** runs the call once the response is sent. It is still a write on a page load, only later, so it adds complexity without removing the exception.

## Consequences

- This is the only write on a page load. Anything else that writes during a render is a bug.
- Home and Equipment can write when an Event has just ended, then show the result straight away.
- Revisit after L4 and L5. Once the Movement Log is the source of truth, Unconfirmed can be derived from it, and this call and the exception can go.
