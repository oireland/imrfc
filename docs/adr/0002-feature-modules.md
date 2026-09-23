# Feature modules with framework-free domain rules

Code is grouped by feature (`users`, `locations`, `kit`, `events`, `duties`, `calendar-feed`), each owning its domain rules as plain TypeScript with no Next.js imports; Next.js routes, server actions and components are thin adapters over them. This keeps the rules fast to test first (TDD) and lets new capabilities — Availability/RSVP is the reference case — arrive as a new feature that references others by id instead of editing them.

## Consequences

- A feature may depend on another feature's public entry point, never its internals.
- Event detail is composed from slots that features contribute to, so extensions can add UI without editing the `events` feature.
