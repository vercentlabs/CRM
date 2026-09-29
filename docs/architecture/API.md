# API (Phase 3; pre-v1 routes removed in Phase 5)

The backend is a modular monolith in strict TypeScript: `apps/api/src`. `TENANCY_AND_AUTH.md` is authoritative for tenancy, sessions and permissions; this page covers how the code is organized.

## Layout

```
src/
  app.ts            composition only: global middleware → /api/v1 → provider webhooks → JSON 404 → error handler
  server.ts         env validation → listen → graceful shutdown
  platform/         cross-cutting: env, db pool, request context, logger, audit writer, tenancy, auth (sessions, tokens,
                    cookies, middleware), http (AppError, error handler, route registry, query helpers,
                    OpenAPI builder), rate limit, CORS, health, Plivo signatures
  integrations/     adapters to external services: plivo (Telephony), imagekit (FileStorage), email (SMTP), gold-rate
  modules/<domain>/ <domain>.routes.ts · .controller.ts · .service.ts · .repository.ts · .schemas.ts
  modules/index.ts  module registry (/api/v1), webhook router
  cli/              operator commands (org bootstrap)
```

Modules: `auth`, `organizations` (members, roles, invitations), `leads`, `customers`, `opportunities`, `tasks` (+ calendar), `followups`, `notes`, `calls` (+ Plivo webhooks), `messages`, `chat`, `files`, `locations`, `reports`, `settings`, `audit`, `market` (gold rate), `notifications`. A module only has the files it needs. Services publish domain events with `emit(tx, …)` from `platform/events.ts` inside their transaction; entitlement checks live in `platform/entitlements.ts` and usage counters in `platform/usage.ts` (see `RUNTIME_PLATFORM.md`).

## Request flow

```
route (registry) → authenticate → requirePermission / requireScope → [before: rate limit, multipart]
  → validate (Zod params/query/body) → controller → service → repository → PostgreSQL
```

| Layer      | May                                                          | Must not                                                   |
| ---------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| routes     | declare method, path, permission, schemas, docs              | contain SQL or logic                                       |
| controller | map validated input to a service call, choose status         | touch SQL, the pool or `@crm/database`                     |
| service    | business rules, ownership checks, transactions, audit events | import Express, read `req`/`res`                           |
| repository | parameterized SQL, tenant conditions, scope filters          | decide permissions, throw HTTP concerns other than via SQL |

`test/architecture.test.ts` enforces the SQL/Express boundaries, the absence of numeric-role authorization, of legacy role ids in DTOs, of the removed compatibility layer and of JavaScript sources.

## Repository tenancy rule

Every repository function takes `(db: Queryable, tenant: Tenant, …)`. `Tenant` is built only from the verified session (`actorFrom(req.auth)`), never from a request body. Every read, update and delete includes `organization_id = $n`; inserts take it from `tenant`. The single exception is `calls.updateByProviderCallId`, a documented system context used only by signature-verified Plivo webhooks.

Scope primitives (`platform/tenancy.ts`): `ownerFilter(actor, permission)` returns `null` (organization scope) or the actor's user id (own scope), which repositories turn into the ownership predicate of their domain:

| Domain                       | "Own" means                                     |
| ---------------------------- | ----------------------------------------------- |
| leads, opportunities         | assigned to me, or unassigned and created by me |
| customers, tasks, follow-ups | assigned to me                                  |
| notes                        | created by me                                   |
| calls, messages              | `user_id` is me                                 |
| chat                         | I am a participant (for every role)             |

Foreign ids (assignees, managers, participants, `lead_id`) are validated inside the organization: `assertMember` / `filterActiveMembers` → 400; a `lead_id` outside tenant or scope → 404. Cross-tenant record ids → 404; same tenant, outside scope → 403.

Transactions use `withTransaction(pool, fn)` from `@crm/database` (lead conversion, assignment, follow-up scheduling, member creation, bulk messages, settings, chat conversations, call end, password reset).

## Envelopes

- Success: `{ "success": true, "data": T, "meta"?: { "pagination": { page, limit, total, totalPages } } }`
- Error: `{ "success": false, "error": { "code", "message", "details"?: [{ field, message }], "requestId" } }`

Services throw `AppError` (`platform/http/errors.ts`); anything else becomes a generic 500 and is logged with the request id. Stack traces and database errors never reach clients.

## Validation

Request schemas live in `@crm/validation` (`src/crm/schemas.ts`, shared helpers in `src/crm/primitives.ts`) and are shared with clients, which also get their input types (`CreateLeadInput`, …). Query/params helpers (`idParams`, `pageQuery`, `sortQuery`, `optionalId`, `optionalDate`) live in `platform/http/query.ts`. Field names in `details` are prefixed with their location (`body.email`, `query.limit`, `params.id`). CRM bodies are snake_case (matching the DTOs); auth/organization bodies keep their Phase 2 camelCase contract (`organizationId`, `refreshToken`, `roleKey`, `newPassword`).

## Pagination, filters, sorting, search

- Lists of leads, customers, opportunities, tasks, notes, calls, messages, members and audit logs: `?page=1&limit=20` (max 100) → `meta.pagination`.
- Sorting is allowlisted per module: `?sort=field` or `?sort=-field` maps to a fixed SQL expression; anything else is a 400.
- Search (`leads.search`, `notes.search`) is parameterized `ILIKE` with `%`, `_` and `\` escaped. No `pg_trgm`/new indexes were added: current volumes do not justify a migration.

## Production hardening (Phase 7)

- **Middleware order:** request context → access log → security headers (helmet) → JSON body (`BODY_LIMIT`) → CORS → `/metrics` → `/api/v1` (`Cache-Control: no-store`, `X-CRM-Version`) → provider webhooks → 404 → error handler.
- **Rate limits** are route `before` middleware (`rateLimit(policies.…)`), shared through Redis.
- **Errors:** unexpected failures are logged at error with a stack and reported (`captureError`); deliberate `AppError` 5xx are warnings.
- **New routes:** `/webhooks` (management, `settings.integrations.manage`), `GET /files/:id/url` (signed file access). `GET /api/v1` also returns `build { version, commit }`.
- **Metrics:** `GET /metrics` (Prometheus, bearer `METRICS_TOKEN`, disabled when unset). See `docs/operations/MONITORING.md`.
- **CLI:** `pnpm plivo:check [--probe]` validates `PLIVO_WEBHOOK_URL` and prints the Plivo callback URLs.

## OpenAPI

`GET /api/v1/openapi.json` is generated at runtime from the route registry (`platform/http/openapi.ts`): paths, parameters and bodies from the Zod schemas (`z.toJSONSchema`), response `data` from each route's documented schema, security schemes (bearer + `crm_at` cookie), the standard error envelope and `x-permission`. `GET /api/v1` returns `{ name, version, openapi }`. `test/openapi.test.ts` validates the document against the OpenAPI 3.1 schema and checks that every registered route is present.

## Clients

`@crm/api-client` exposes `client.v1.<resource>` (leads, customers, …, auth, organizations) typed with `@crm/types` DTOs and `@crm/validation` inputs. Web uses cookie mode (`credentials: 'include'`, `getCsrfToken`), mobile uses bearer mode (`getToken`). Errors are `ApiClientError` with `code`, `status`, `details` and `requestId`.

## Removed pre-v1 routes (Phase 5)

The unversioned routes (`/leads`, `/users`, `/api/chat`, `/health`, …) and their adapters (`*.legacy.ts`, `createLegacyRouter`, `platform/http/legacy*.ts`) were deleted once web (Phase 4) and mobile (Phase 5) used only `/api/v1`. Every unknown path, old ones included, answers the standard JSON 404 envelope; `test/http.test.ts` asserts that for each old prefix so none is remounted by accident. Old clients (for example an outdated mobile build) must upgrade. The table maps each old route to its replacement:

| Removed                                            | /api/v1                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/auth/login`, `/auth/logout`                      | `/auth/login`, `/auth/logout` (+ `refresh`, `session`, `switch-organization`) |
| `/users/forgot-password` … `/verify-reset-token`   | `/auth/password/{forgot,reset,verify}`                                        |
| `/users`, `/users/:id`, `/users/:id/status`        | `/organization/members[/:userId[/profile]]`                                   |
| `/users/me`                                        | `/auth/session`                                                               |
| `/users/verify-email`, `/users/test-email`         | `/settings/email/{verify,test}`                                               |
| `/leads/*`                                         | `/leads`, `/leads/:id`, `/leads/:id/assignment`, `/leads/:id/followups`       |
| `/customers`, `/opportunities`, `/tasks`, `/notes` | same nouns (PATCH replaces PUT)                                               |
| `/calendar`                                        | `/calendar/events`                                                            |
| `/followups`, `/followups/overdue`                 | `/followups?overdue=true`, `/followups/:id/complete`                          |
| `/calls/initiate`, `/calls/:id/end`                | `POST /calls`, `POST /calls/:id/end`                                          |
| `/messages/*`, `/api/lead-messages/*`              | `/messages`, `/messages/bulk`, `/messages/:id/status`                         |
| `/api/chat/*`                                      | `/chat/conversations/*`, `/chat/presence`                                     |
| `/api/upload/chat-attachment`                      | `/files/chat-attachments`                                                     |
| `/sales-locations/*`                               | `/locations/*` (`PUT /locations/me` = check-in)                               |
| `/reports/*`                                       | `/reports/*` (`/conversion`, `/leads-export`)                                 |
| `/settings`, `/audit`                              | `/settings`, `/audit-logs`                                                    |
| `/gold/gold-rate`, `/gold/gold/refresh`            | `/market/gold-rate[/refresh]`                                                 |
| `/admin/dashboard`, `/health`                      | – (`/api/v1/health/{live,ready}`)                                             |

Provider webhooks `/api/plivo/webhook/{answer,recording,status,message-status}` are the only routes outside `/api/v1`: stable, signature-verified URLs that were kept.
