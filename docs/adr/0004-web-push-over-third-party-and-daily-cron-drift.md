# Web Push (self-hosted) over a third-party push service; one daily cron, BST drift accepted

Push notifications (morning-of reminders, and a push alongside Announce/Nudge) use the
Web Push standard (VAPID keys, the `web-push` npm package) rather than a third-party
push provider. It needs no account, no paid tier and no data leaving our own Postgres —
in keeping with the "free to build and run" constraint — and it mirrors the existing
`MailSender` pattern (`src/lib/messaging/mail.ts`): a `PushSender` interface in `src/lib/messaging/push.ts`
with a real implementation and a console one for tests.

The morning-of reminder is triggered by a single Vercel Cron job
(`vercel.json` → `crons`) hitting `/api/cron/morning-of` once a day at `30 6 * * *` UTC —
chosen to land around 7:30am London through most of the year. Vercel Cron schedules are
always UTC and the Hobby plan caps cron jobs at once a day, so this drifts by an hour
either side of a BST change (a ~6:30am or ~8:30am reminder for a few days each spring and
autumn). That's an acceptable trade for a club reminder — running two crons (one for BST,
one for GMT) to fix an hour of drift twice a year isn't worth the added complexity.

## Considered options

- **A third-party push service** (OneSignal, Firebase Cloud Messaging, etc.): adds an
  external account and dependency for something Web Push already does natively in every
  major browser; ruled out by the same reasoning as ADR 0001.
- **Two Vercel Crons, switched by date, to track BST exactly**: correct, but adds a
  second cron and a decision no one on the committee could recover without reading this
  ADR, for an hour of drift twice a year.

## Consequences

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` and `CRON_SECRET` are new
  required env vars in production (see `.env.example`); `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  is the same public key, read client-side to subscribe a browser.
- A push subscription is tied to one browser/device, not one User's account across
  devices — a User who wants reminders on their phone and their laptop enables
  notifications on both.
