# Team Sheet PDFs generated in code; the shared Selection board polls instead of using realtime

The team-selection tool we replaced (see SPEC → Selection) produced Team Sheet PDFs by
driving a browser on the server. On a host that needs a small always-on instance
(~£5/month) rather than Vercel's free serverless functions — its handover called this
"the one hosting constraint" and said it drives the choice of host. We instead build the
PDF in code with `@react-pdf/renderer`, which runs in an ordinary Vercel Function with no
browser, keeping to the "free to build and run" constraint. The sheet is a plain header
and a table, so nothing is lost by not rendering HTML. Word files, the other half of the
old output, were dropped.

The Selection board is shared by every Committee User picking a match day, so two
selectors can edit at once. Each Shirt is saved on its own (the last change to a Shirt
wins) and an open board refreshes every ~5 seconds, flashing a Shirt someone else changed.
With three or so selectors editing different Shirts, a few seconds' lag is harmless, and
per-Shirt saves mean they never overwrite each other's work.

## Considered options

- **Server-side browser PDF (Puppeteer/Playwright)**: matches the old output exactly, but
  needs paid always-on hosting or a heavy Chromium bundle in a function.
- **Print to PDF from the user's browser**: free, but an extra step on a phone and the
  result varies by browser.
- **A realtime service from the Vercel Marketplace (Pusher, Ably…)**: instant updates, but
  another account and dependency for a handful of users (same reasoning as ADR 0001 and
  ADR 0004).
- **Our own WebSockets on Vercel Functions**: possible, but more moving parts than polling
  for no visible gain at this scale.

## Consequences

- The on-screen preview and the PDF must read from one layout definition (which fields,
  in what order, which Shirts print) so they can't drift apart.
- An open board makes a request every ~5 seconds per selector. Stop polling when the tab
  is hidden.
- If selection ever needs many simultaneous editors, swap polling for a realtime channel
  behind the same per-Shirt save; the data model doesn't change.
