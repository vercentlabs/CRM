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
api, worker ─► database, config, (events, observability)
database ─► (pg only)
```

Clients never import `database`. `types` holds wire contracts only, never DB rows.

## TypeScript

- All new code is strict TypeScript (`@crm/config/tsconfig/{node,library}.json`).
- API migration is incremental: `allowJs` with `checkJs: false`. It is built by `tsc` to `dist/`, and `tsx` is used in dev. A JS file graduates to TS when its module is touched in Phase 3.
- Web is JS today and moves to TS page-by-page when screens are rebuilt. Mobile is already TS.

## API

- **Versioning:** everything new is under `/api/v1`. Legacy unversioned routes stay mounted until the web and mobile callers move (Phase 3). They are then removed in one reviewed change, never silently.
- **Module layout (Phase 3):** `src/modules/<domain>/{routes,controller,service,repository,schemas}.ts`. Controllers are thin (parse, authorize, call service, respond), services hold business rules, and repositories hold all SQL.
- **Success envelope:** `{ "success": true, "data": T, "meta"?: { "pagination"?: {page,limit,total,totalPages} } }`
- **Error envelope:** `{ "success": false, "error": { "code": ErrorCode, "message": string, "details"?: [{field,message}], "requestId": string } }`
  - Codes (`@crm/types` `ERROR_CODES`): BAD_REQUEST 400, VALIDATION_FAILED 400, UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, CONFLICT 409, PAYLOAD_TOO_LARGE 413, RATE_LIMITED 429, INTERNAL_ERROR 500, SERVICE_UNAVAILABLE 503.
  - Throw `AppError` (`src/platform/http/errors.ts`). Anything else becomes a generic 500, and the real error is logged with the request ID. Stack traces are never returned.
  - Legacy routes keep `{ success:false, message }` (plus `requestId`) for compatibility.
- **Request ID:** `x-request-id` is accepted if it matches `[A-Za-z0-9._:-]{8,128}`, otherwise generated. It is echoed on every response and included in error bodies and logs.
- **Request context:** `AsyncLocalStorage` (`src/platform/request-context.ts`) carries `requestId` and `user` today. Phase 2 adds `organizationId`, `membershipId` and `permissions`.
- **Validation:** zod schemas from `@crm/validation`, shared with clients. Issues map to `details`.
- **OpenAPI:** generated from the zod schemas and route registry in Phase 3 and served at `/api/v1/openapi.json`. `api-client` types derive from it.
- **Health:** `/api/v1/health/live` (process up) and `/api/v1/health/ready` (DB `SELECT 1` within 2s, not draining). They return status and latency only. Legacy `/health` is kept.

## Tenancy (Phase 2)

- `organizations`, `memberships (user_id, organization_id, role, status)`, and invitations.
- Every business table gets `organization_id NOT NULL` plus indexes leading with it. Unique constraints become per-organization.
- The tenant is resolved from the authenticated membership (the JWT carries the user and the active org, verified against `memberships`), never from the request body.
- Repositories require the org ID. Postgres RLS may be added as defence-in-depth, but the application-level filter is mandatory either way.
- Existing data is backfilled into one default organization by a reviewed migration.

## Permissions (Phase 2)

- Permission names come from `@crm/permissions` (`resource:action`). Roles map to permission sets per organization, and record scopes (`own`, `team`, `all`) apply per resource.
- The server enforces permissions through `requirePermission()` middleware plus scope filters in repositories. Clients only use permissions to hide UI.

## Database

- PostgreSQL, accessed through `packages/database` (`createPool`, `checkDatabase`, and the migration runner). There is no ORM; SQL stays parameterized in repositories. A query builder can be introduced in Phase 3 if justified.
- **Migrations:** `packages/database/migrations/NNNN_name.sql`. They are forward-only and ordered by version. History is kept in `schema_migrations` with a sha256 checksum, and applied files are immutable. Each file runs in its own transaction (`-- crm:no-transaction` opts out). An advisory lock prevents concurrent runs. Destructive SQL (`DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE FROM`) is refused unless the file contains `-- crm:allow-destructive` after human review. Existing databases are adopted once with `pnpm db:migrate:baseline`.

## Web

Next.js App Router, presentation only. It calls the API through `@crm/api-client` (a single client replacing the current three), uses shared zod schemas for forms, and has no DB access. The auth token moves from `localStorage` to an httpOnly cookie in Phase 2 or 5.

## Mobile

Expo, native UI and navigation only. It uses `@crm/api-client` (lazy base URL plus an AsyncStorage/SecureStore token) and the same contracts as web. Device features (storage, documents, notifications) stay in the app.

## Worker, jobs and events

- `apps/worker` runs the same code packages as the API, but no HTTP.
- Phase 6 adds Redis and BullMQ (only when Redis is provisioned) for email, SMS, report exports, reminders and webhooks. Jobs are idempotent and keyed by name.
- Events: `packages/events` defines typed domain events (`lead.created`, …). They are written to an outbox table in the same transaction and dispatched by the worker, so there is no broker.

## Files

Uploads go through the API (size and type validated), are stored in ImageKit or S3-compatible storage, and are recorded in a `files` table scoped by `organization_id`. Clients receive short-lived URLs, never provider credentials.

## Observability

- JSON logs to stdout that include `requestId`, `userId` and (from Phase 2) `organizationId`. Secrets and tokens are redacted.
- `packages/observability` wraps the logger, metrics and tracing (OpenTelemetry when needed). Health endpoints feed the load balancer.

## Testing

- Vitest everywhere. Unit tests sit next to the code (`*.test.ts`), and API HTTP tests live in `apps/api/test/*.test.ts` against a real ephemeral server.
- DB integration tests run when `TEST_DATABASE_URL` points at a disposable Postgres. They use a throwaway schema per run.
- Web tests use the colocated `*.test.js` convention (Vitest, node env; jsdom only if component tests are added). Mobile tests (jest-expo) are added in Phase 5.
- `pnpm test` runs everything through turbo, and each package can run `pnpm --filter <pkg> test` on its own.
