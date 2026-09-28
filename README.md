# CRM

A multi-tenant SaaS CRM organized as a pnpm + Turborepo monorepo and built as a modular monolith. This is a standalone product; it is not the Vercentlabs ERP.

```
apps/
  api/       Express REST API (/api/v1)
  web/       Next.js web app (TypeScript, /api/v1 via @crm/api-client)
  mobile/    Expo / React Native app (TypeScript, /api/v1 via @crm/api-client)
  worker/    Background worker (foundation)
packages/
  config/       TS configs + env validation      types/        client-safe API contracts
  validation/   shared zod schemas               api-client/   shared fetch client
  permissions/  permissions, roles, scope checks  database/     pg pool, health, migrations
  ui/           web design system (tokens + accessible React primitives)
infrastructure/docker/   api / web / worker Dockerfiles (build from repo root)
docs/architecture/       CURRENT_SYSTEM, TARGET_SYSTEM, API, WEB, MOBILE, TENANCY_AND_AUTH, GUARDRAILS, MIGRATION_TRACKER
```

## Getting started

Requirements: Node ≥ 22.12, pnpm 11 (`corepack enable`), and PostgreSQL.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # fill in DATABASE_URL, JWT_SECRET, ...
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate            # existing DB created before Phase 1? run `pnpm db:migrate:baseline` once first
# Fresh database only: create the first organization and admin (credentials from env)
BOOTSTRAP_ORG_NAME="Acme" BOOTSTRAP_ADMIN_EMAIL=you@acme.test BOOTSTRAP_ADMIN_PASSWORD="<12+ chars>" pnpm org:bootstrap
pnpm dev                   # api + web
pnpm dev:mobile            # Expo dev server
```

| Command                                                         | What it does                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm build` / `lint` / `typecheck` / `test`                    | Runs the task across the workspace via turbo                    |
| `pnpm --filter @crm/api test`                                   | Runs one package's task                                         |
| `pnpm db:migrate` / `db:migrate:status` / `db:migrate:baseline` | Forward-only SQL migrations (see `packages/database/README.md`) |
| `pnpm format` / `format:check`                                  | Prettier over packages, API, web, mobile, worker and docs       |
| `pnpm --filter @crm/web test:e2e`                               | Playwright critical paths (needs `E2E_DATABASE_URL`, built API) |

Set `TEST_DATABASE_URL` to a disposable Postgres to enable the database integration tests. Browser tests need `npx playwright install chromium` once and `E2E_DATABASE_URL` pointing at a throwaway database (it is migrated and seeded).

## API

Health checks are at `GET /api/v1/health/live` and `GET /api/v1/health/ready`. Every domain is served under `/api/v1` (OpenAPI at `GET /api/v1/openapi.json`); see `docs/architecture/API.md`. The pre-v1 unversioned routes were removed in Phase 5 and answer a JSON 404; only the Plivo webhooks (`/api/plivo/webhook/*`) live outside `/api/v1`.

Read `docs/architecture/GUARDRAILS.md` and `docs/architecture/TENANCY_AND_AUTH.md` before adding code. Every query on tenant data must be bounded by the verified organization (repositories take a `Tenant` from `actorFrom(req.auth)`).
