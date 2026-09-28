# Target System

This is the agreed end state after the 7 phases. It is a **modular monolith**: one deployable API, one worker, and one PostgreSQL database. It does not use microservices, Kubernetes, Kafka or Elasticsearch.

## Repository

```
apps/      api (Express → modules), web (Next.js), mobile (Expo), worker (jobs)
packages/  config, types, validation, api-client, permissions, database   ← exist (Phase 1)
           events, observability, testing, ui                             ← added when first needed
infrastructure/  docker/ (Phase 1), deployment/, monitoring/
docs/architecture/
```

The workspace uses pnpm with the isolated linker and Turborepo. Root commands are `dev`, `build`, `lint`, `typecheck`, `test`, `format` and `db:migrate*`. Packages compile with `tsc` to `dist/` as ESM with `.d.ts`, and apps consume the built output (`turbo` builds dependencies first via `^build`).

### Dependency direction (enforced by review, later by lint)

```
web, mobile ─► api-client ─► types
web, mobile, api ─► validation, permissions, types
api, worker ─► database, config, events, entitlements, integrations, (observability)
database ─► (pg only)
```

Clients never import `database`. `types` holds wire contracts only, never DB rows.

## TypeScript

- All new code is strict TypeScript (`@crm/config/tsconfig/{node,library}.json`).
- The API is fully TypeScript since Phase 3 (no `allowJs`). It is built by `tsc` to `dist/`, and `tsx` is used in dev.
- Web is TypeScript since Phase 4; mobile is TypeScript and was rebuilt on the shared packages in Phase 5.

## API

- **Versioning:** every client route is under `/api/v1`. The unversioned routes were removed in one reviewed change in Phase 5, after web (Phase 4) and mobile (Phase 5) moved; they answer a JSON 404. Only the Plivo webhooks live outside `/api/v1`.
- **Module layout (Phase 3, implemented):** `src/modules/<domain>/{routes,controller,service,repository,schemas}.ts`, declared in a route registry that drives mounting, validation and OpenAPI. Controllers are thin, services hold business rules and transactions, and repositories hold all SQL. Details in `API.md`.
- **Success envelope:** `{ "success": true, "data": T, "meta"?: { "pagination"?: {page,limit,total,totalPages} } }`
- **Error envelope:** `{ "success": false, "error": { "code": ErrorCode, "message": string, "details"?: [{field,message}], "requestId": string } }`
  - Codes (`@crm/types` `ERROR_CODES`): BAD_REQUEST 400, VALIDATION_FAILED 400, UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, PAYLOAD_TOO_LARGE 413, RATE_LIMITED 429, INTERNAL_ERROR 500, SERVICE_UNAVAILABLE 503.
  - Throw `AppError` (`src/platform/http/errors.ts`). Anything else becomes a generic 500, and the real error is logged with the request ID. Stack traces are never returned.
- **Request ID:** `x-request-id` is accepted if it matches `[A-Za-z0-9._:-]{8,128}`, otherwise generated. It is echoed on every response and included in error bodies and logs.
- **Request context:** `AsyncLocalStorage` (`src/platform/request-context.ts`) carries `requestId`, the client IP/user agent and (since Phase 2) the verified `auth` context: userId, sessionId, organizationId, membershipId, roleKey and permissions.
- **Validation:** zod schemas from `@crm/validation`, shared with clients. Issues map to `details`.
- **OpenAPI:** generated from the zod schemas and route registry and served at `/api/v1/openapi.json`. `api-client` uses the same sources directly (`@crm/types` DTOs, `@crm/validation` inputs) instead of code generation.
- **Health:** `/api/v1/health/live` (process up) and `/api/v1/health/ready` (DB `SELECT 1` within 2s, not draining). They return status and latency only. The pre-v1 `/health` was removed in Phase 5 (the Docker `HEALTHCHECK` uses `/api/v1/health/live`).

## Tenancy (implemented in Phase 2)

- Tables: `organizations` (public UUID `public_id`), `organization_memberships` (`active`, `invited` or `suspended`), and `auth_sessions`. Every business table has `organization_id NOT NULL`; the details are in `TENANCY_AND_AUTH.md`.
- The active organization is stored on the server session and bound into the access token. It is re-verified against the membership on every request and never taken from the request body.
- Application-level filtering is mandatory: repositories take a `Tenant` built only from the verified session (`actorFrom(req.auth)`). Postgres RLS remains optional defence-in-depth for a later phase.

## Permissions (implemented in Phase 2)

- Permission names are `crm.<resource>.<action>` / `settings.<area>.<action>` from `@crm/permissions`. Roles are built-in templates (admin, manager, sales) plus optional organization-owned roles, and each grant carries a scope of `own` or `organization`.
- `team` is reserved until a real teams model exists.
- The server enforces this through `requirePermission` and `requireScope` middleware plus scope filters in queries. Clients use permissions only to hide UI.

## Database

- PostgreSQL, accessed through `packages/database` (`createPool`, `checkDatabase`, and the migration runner). There is no ORM; SQL stays parameterized in repositories. A query builder can be introduced in Phase 3 if justified.
- **Migrations:** `packages/database/migrations/NNNN_name.sql`. They are forward-only and ordered by version. History is kept in `schema_migrations` with a sha256 checksum, and applied files are immutable. Each file runs in its own transaction (`-- crm:no-transaction` opts out). An advisory lock prevents concurrent runs. Destructive SQL (`DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE FROM`) is refused unless the file contains `-- crm:allow-destructive` after human review. Existing databases are adopted once with `pnpm db:migrate:baseline`.

## Web

Next.js App Router, presentation only (implemented in Phase 4, see `WEB.md`). It calls the API through `@crm/api-client`, uses shared zod schemas for forms and `@crm/ui` for components, and has no DB access. Auth is an HttpOnly cookie session with a CSRF header (Phase 2); JavaScript never holds tokens.

## Mobile

Expo, native UI and navigation only (implemented in Phase 5, see `MOBILE.md`). It uses `@crm/api-client` in bearer mode (short-lived access token in memory, rotating refresh token in SecureStore), shared zod schemas and permissions, and the same contracts as web. Device features (secure storage, documents, notifications) stay in the app.

## Worker, jobs and events

Implemented in Phase 6; details in `RUNTIME_PLATFORM.md`.

- `apps/worker` uses the same packages as the API and serves no business HTTP (only an optional health endpoint).
- Events (`packages/events`, typed and versioned) are written to `outbox_events` in the same transaction as the change. The worker relays them (SKIP LOCKED leases) to BullMQ queues (`communications`, `notifications`, `webhooks`, `maintenance`) for email, SMS, notifications, reminders, provider cleanup and signed outbound webhooks. Jobs are idempotent; Redis never holds business state.
- Plans and entitlements (`packages/entitlements`) are data, resolved server-side and separate from permissions.

## Files

Uploads go through the API (size, allowlisted type and magic bytes validated), are stored through the `FileStorage` interface (ImageKit today; S3-compatible later) and recorded in the `files` table scoped by `organization_id` (Phase 6). Deletion is metadata-first; the worker removes provider objects. Clients never receive provider credentials. Short-lived signed URLs are a later hardening step.

## Observability

- JSON logs to stdout that include `requestId`, `userId` and (from Phase 2) `organizationId`. Secrets and tokens are redacted.
- `packages/observability` wraps the logger, metrics and tracing (OpenTelemetry when needed). Health endpoints feed the load balancer.

## Testing

- Vitest everywhere. Unit tests sit next to the code (`*.test.ts`), and API HTTP tests live in `apps/api/test/*.test.ts` against a real ephemeral server.
- DB integration tests run when `TEST_DATABASE_URL` points at a disposable Postgres. They use a throwaway schema per run.
- Web tests: Vitest + Testing Library (`apps/web/test`) and Playwright E2E (`apps/web/e2e`). Mobile tests: jest-expo + React Native Testing Library (`apps/mobile/test`), including an architecture test.
- `pnpm test` runs everything through turbo, and each package can run `pnpm --filter <pkg> test` on its own.
