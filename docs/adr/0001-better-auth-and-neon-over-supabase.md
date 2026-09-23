# Better Auth + Neon over Supabase

We keep auth inside the app (Better Auth with Google, magic link and its admin plugin for banning) on plain Postgres (Neon in production, Docker in dev, PGlite in tests), rather than using Supabase's bundled Postgres + Auth. Supabase's free tier pauses projects after 7 days of inactivity — which a student club hits every summer and Christmas — and its hosted auth is awkward to exercise in a fast local TDD loop. Owning auth tables in our own schema also lets features join against users directly.

## Considered Options

- **Supabase** (Postgres + Auth + dashboard): fastest start, but inactivity pausing and harder local testing.
- **Clerk**: generous free tier, but user data lives outside our DB and blocking/approval would be split across two systems.
