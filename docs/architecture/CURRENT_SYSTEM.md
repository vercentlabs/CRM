# Current System (updated after Phase 6, 2026-09-29)

A snapshot of what exists, so later phases don't have to rediscover it. Paths are post-Phase-1.

## Shape

| Part   | Path          | Stack                                                                                                       | Notes                                                                                   |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| API    | `apps/api`    | Node ≥22, Express 5, strict TypeScript, `pg`                                                                | Modular monolith since Phase 3 (`src/modules/<domain>`); see `API.md`.                  |
| Web    | `apps/web`    | Next.js 16 (App Router, React Compiler), React 19.2, TanStack Query, React Hook Form, Tailwind 4, `@crm/ui` | TypeScript since Phase 4; `/api/v1` only through `@crm/api-client`; see `WEB.md`.       |
| Mobile | `apps/mobile` | Expo SDK 54, React Native 0.81, React 19.1, React Navigation 7, TanStack Query, React Hook Form             | TypeScript (strict). `/api/v1` only through `@crm/api-client`; see `MOBILE.md`.         |
| Worker | `apps/worker` | TypeScript, BullMQ (Redis)                                                                                  | Outbox relay, queues, reminders, maintenance; see `RUNTIME_PLATFORM.md`.                |
| DB     | PostgreSQL    | `packages/database`                                                                                         | Multi-tenant schema (0001–0004), serial integer PKs; see `packages/database/README.md`. |

Before Phase 1 the apps lived at `crm-backend/`, `c-frontend/c-frontend/crm-frontend/` and `crm-mobile/crm-mobile/crm-mobile/`, each with its own lockfile.

## Domains (pre-v1 route prefix, removed in Phase 5 → module; /api/v1 routes in `API.md`)

| Domain                      | Pre-v1 prefix (removed)                   | Tables                                               | Guard (built-in role equivalent; enforced by permissions since Phase 2) |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Auth                        | `/auth` (login, logout)                   | users, audit_logs                                    | public login                                                            |
| Users + password reset      | `/users`                                  | users, password_resets                               | admin/manager; reset endpoints public                                   |
| Leads (+assign, +followups) | `/leads`                                  | leads, followups                                     | any user; assign = admin/manager                                        |
| Customers                   | `/customers`                              | customers                                            | roles 1-3; delete = admin                                               |
| Opportunities               | `/opportunities`                          | opportunities                                        | any; assign = admin/manager                                             |
| Tasks                       | `/tasks`                                  | tasks                                                | any                                                                     |
| Follow-ups                  | `/followups`                              | followups                                            | any                                                                     |
| Notes                       | `/notes`                                  | notes                                                | any (ownership checked in controller)                                   |
| Calls (Plivo)               | `/calls`, `/api/plivo/webhook/*`          | calls                                                | webhooks signature-verified since Phase 2                               |
| Calendar                    | `/calendar`                               | tasks (calendar events are rows in `tasks`)          | any                                                                     |
| SMS-style messages          | `/messages`, `/api/lead-messages`         | messages                                             | any                                                                     |
| Chat                        | `/api/chat`                               | chat_conversations, chat_participants, chat_messages | any (polling, no websockets)                                            |
| Uploads                     | `/api/upload/chat-attachment`             | – (ImageKit)                                         | any; multer memory, 10 MB                                               |
| Reports                     | `/reports`                                | leads, followups, users                              | any; scoped in SQL by role                                              |
| Sales locations             | `/sales-locations`                        | sales_locations, user_locations                      | admin/manager; sales updates own                                        |
| Settings                    | `/settings`                               | settings                                             | admin                                                                   |
| Audit                       | `/audit`                                  | audit_logs                                           | admin                                                                   |
| Gold rate widget            | `/gold-rate`                              | – (Alpha Vantage, in-memory cache)                   | any; refresh = admin                                                    |
| Health                      | `/health` → `/api/v1/health/{live,ready}` | –                                                    | public                                                                  |

The old mobile AI assistant (`/ai/*`) and Google Calendar connection (`/integrations/google/*`) called endpoints that never existed; both were removed in Phase 5.

## Authentication & authorization flow (since Phase 2)

Sessions and tenancy are described in `TENANCY_AND_AUTH.md`. In short:

- Login creates a server session with a 15-minute access JWT `{sub, sid, org}` and a rotating refresh token (hashed in the DB). Web receives HttpOnly cookies plus a CSRF token; mobile receives tokens in the body and keeps the refresh token in SecureStore.
- `authenticate` re-verifies the session, user, active membership and organization on every request. It then sets `req.auth` (tenant context).
- Routes declare permissions with `requirePermission` / `requireScope`. Controllers bound every query by `req.auth.organizationId` and apply own/organization scope.
- Web and mobile show menus and actions from the session's permissions (UX only). Numeric role ids were removed from responses and the schema in Phase 5.

## Data flow

```
web (@crm/api-client, cookies) ─────┐
mobile (@crm/api-client, bearer) ───┼─► /api/v1 registry ─► services ─► repositories ─► PostgreSQL
Plivo webhooks (/api/plivo/*) ──────┘                 └─► ImageKit / Plivo / SMTP / Alpha Vantage
```

The API base URL comes from `NEXT_PUBLIC_API_BASE_URL` on web and from `EXPO_PUBLIC_API_BASE_URL` on mobile (build time; dev falls back to the Metro host). Every response uses the standard `/api/v1` envelopes (see `API.md`).

## Entry points

- API: `apps/api/src/server.ts` (env validation → `app.ts` → listen, graceful shutdown). Modules are registered in `src/modules/index.ts`.
- Web: `apps/web/src/app/layout.tsx`, pages in `src/app/**/page.tsx`, session in `src/providers/SessionProvider.tsx` (see `WEB.md`).
- Mobile: `apps/mobile/index.ts` → `App.tsx` → `src/navigation/RootNavigator.tsx`, session in `src/providers/SessionProvider.tsx` (see `MOBILE.md`).
- Worker: `apps/worker/src/index.ts`.
- Migrations: `pnpm db:migrate` → `packages/database/src/cli/migrate.ts`.

## Architectural risks & technical debt

1. ~~No tenancy~~: fixed in Phase 2. Every business table is tenant-owned; see `TENANCY_AND_AUTH.md`.
2. ~~Authorization scattered~~: permissions since Phase 2; scope predicates live in repositories since Phase 3.
3. ~~Controllers own everything~~: fixed in Phase 3 (routes → controller → service → repository).
4. **Schema drift.** The schema was hand-managed in pgAdmin. `0001_baseline_schema.sql` is the reference snapshot (drift found so far: `chat_messages.file_type`, added in 0003).
5. **SDK clients are constructed at import time** (ImageKit, Plivo), so the API cannot boot without those credentials and tests need placeholders.
6. **Remaining hardening:** Plivo signatures are verified since Phase 2 (end-to-end check against the deployed URL is pending, Phase 7). The rate limiter is in-memory, and there is no helmet yet.
7. ~~Error leakage~~: fixed in Phase 2; one error handler and envelope since Phase 5.
8. ~~Legacy bugs found by lint~~: fixed in Phase 2 with regression tests (notes count query, email `resetUrl`, the `dbTest.js` script was removed).
9. **Dead code:** the old `TEXT_ARRAY` pg parser never registered (the key is `undefined`), so pg's built-in array parser has always been used, and Phase 1 keeps it.
10. ~~Mobile typecheck and web lint errors~~: fixed in Phase 2 (0 errors).
11. **Chat is polling-based**, and there is no background processing: emails are sent inline in requests.
