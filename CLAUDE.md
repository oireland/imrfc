# IMRFC Club Hub

Events and kit-tracking app for Imperial Medicals RFC. Read before working:

- [SPEC.md](SPEC.md) — what v1 does and doesn't do. Check scope here before adding behaviour.
- [CONTEXT.md](CONTEXT.md) — the domain glossary. Name code, tests, UI copy and conversation with these terms (Kit Unit, Whereabouts, To Duty, Confirm…), including the _Avoid_ lists.
- [PLAN.md](PLAN.md) — the ordered slices. Work on the current slice only; tick it off when the user has reviewed it.
- [docs/adr/](docs/adr/) — decisions that look odd without context. Read before changing auth, database, or folder structure.

## Working rules

- **TDD, always.** Write a failing test, watch it go red, make it green, refactor. One behaviour per cycle. No production code without a red test demanding it.
- **Domain rules live in plain TypeScript** inside their feature, with no Next.js imports; routes, server actions and components are thin adapters. Test the rules directly; test DB-touching code against PGlite; cover each slice's main flow with one Playwright test.
- **Features talk through public entry points.** A feature imports another feature's `index.ts`, never its internals. New capabilities (e.g. Availability) arrive as new features, not edits to existing ones.
- **Mobile-first UI.** Design at phone width first; shadcn/ui components; colours only from the theme tokens (palette in SPEC → Look and feel).
- **Times are Europe/London.** Store UTC, convert at the edges, and test across BST changes.
- **Nothing is hard-deleted** — Kit Units, Stores and Events are archived, Retired or Cancelled.
- Deployment to Vercel waits until the app is fully working locally.

## Environment

- WSL2, Node 24, pnpm.
- Tests need no Docker (PGlite). `pnpm dev` needs Docker Postgres + Mailpit via `docker compose up`; if `docker` is missing in WSL, the user must enable Docker Desktop → Settings → Resources → WSL integration.

@AGENTS.md
