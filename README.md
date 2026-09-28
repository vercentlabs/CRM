# CRM

A multi-tenant SaaS CRM organized as a pnpm + Turborepo monorepo and built as a modular monolith. This is a standalone product; it is not the Vercentlabs ERP.

```
apps/
  api/       Express REST API (legacy routes + /api/v1)
  web/       Next.js web app
  mobile/    Expo / React Native app
  worker/    Background worker (foundation)
packages/
  config/       TS configs + env validation      types/        client-safe API contracts
  validation/   shared zod schemas               api-client/   shared fetch client
  permissions/  permission names + role ids      database/     pg pool, health, migrations
infrastructure/docker/   api / web / worker Dockerfiles (build from repo root)
docs/architecture/       CURRENT_SYSTEM, TARGET_SYSTEM, GUARDRAILS, MIGRATION_TRACKER
```

## Getting started

Requirements: Node ≥ 22.12, pnpm 11 (`corepack enable`), and PostgreSQL.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # fill in DATABASE_URL, JWT_SECRET, ...
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate            # existing DB created before Phase 1? run `pnpm db:migrate:baseline` once first
pnpm dev                   # api + web
pnpm dev:mobile            # Expo dev server
```

| Command                                                         | What it does                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm build` / `lint` / `typecheck` / `test`                    | Runs the task across the workspace via turbo                    |
| `pnpm --filter @crm/api test`                                   | Runs one package's task                                         |
| `pnpm db:migrate` / `db:migrate:status` / `db:migrate:baseline` | Forward-only SQL migrations (see `packages/database/README.md`) |
| `pnpm format` / `format:check`                                  | Prettier, applied to new platform code only                     |

Set `TEST_DATABASE_URL` to a disposable Postgres to enable the database integration tests.

## API

Health checks are at `GET /api/v1/health/live` and `GET /api/v1/health/ready`. New endpoints go under `/api/v1` and use the envelopes described in `docs/architecture/TARGET_SYSTEM.md`. The legacy unversioned routes keep working until Phase 3 migrates their callers.

Read `docs/architecture/GUARDRAILS.md` before adding code.
