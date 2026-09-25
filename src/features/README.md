# Features

Code is grouped by feature, not by layer ([ADR 0002](../../docs/adr/0002-feature-modules.md)):

```
src/features/<feature>/
  index.ts    the public entry point — the only file other features import
  schema.ts   the feature's Drizzle tables (picked up by drizzle.config.ts)
  *.ts        domain rules in plain TypeScript, no Next.js imports
  *.test.ts   tests beside the code (PGlite via `createTestDb` from `@/test/db`)
```

Planned features: `users`, `stores`, `kit`, `events`, `duties`, `calendar-feed`. Each folder is created by the slice that needs it.

Next.js routes, server actions and components in `src/app` are thin adapters over these features.
`src/architecture/source-tree.test.ts` fails if a feature imports another feature's internals.
