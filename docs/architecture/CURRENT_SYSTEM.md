# Current System (updated after Phase 3, 2026-09-28)

A snapshot of what exists, so later phases don't have to rediscover it. Paths are post-Phase-1.

## Shape

| Part   | Path          | Stack                                                                                                       | Notes                                                                                        |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| API    | `apps/api`    | Node ≥22, Express 5, strict TypeScript, `pg`                                                                | Modular monolith since Phase 3 (`src/modules/<domain>`); see `API.md`.                       |
| Web    | `apps/web`    | Next.js 16 (App Router, React Compiler), React 19.2, TanStack Query, React Hook Form, Tailwind 4, `@crm/ui` | TypeScript since Phase 4; `/api/v1` only through `@crm/api-client`; see `WEB.md`.            |
| Mobile | `apps/mobile` | Expo SDK 54, React Native 0.81, React 19.1, React Navigation 7, NativeWind 4                                | TypeScript (strict). Own `fetch` client. EAS project configured.                             |
| Worker | `apps/worker` | TypeScript                                                                                                  | Phase 1 skeleton only; no jobs yet.                                                          |
| DB     | PostgreSQL    | `packages/database`                                                                                         | Single-tenant schema, serial integer PKs. Baseline in `migrations/0001_baseline_schema.sql`. |

Before Phase 1 the apps lived at `crm-backend/`, `c-frontend/c-frontend/crm-frontend/` and `crm-mobile/crm-mobile/crm-mobile/`, each with its own lockfile.

## Domains (legacy route prefix → module; /api/v1 equivalents in `API.md`)

| Domain                      | Legacy prefix                                     | Tables                                               | Guard (built-in role equivalent; enforced by permissions since Phase 2) |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Auth                        | `/auth` (login, logout)                           | users, audit_logs                                    | public login                                                            |
| Users + password reset      | `/users`                                          | users, password_resets                               | admin/manager; reset endpoints public                                   |
| Leads (+assign, +followups) | `/leads`                                          | leads, followups                                     | any user; assign = admin/manager                                        |
| Customers                   | `/customers`                                      | customers                                            | roles 1-3; delete = admin                                               |
| Opportunities               | `/opportunities`                                  | opportunities                                        | any; assign = admin/manager                                             |
| Tasks                       | `/tasks`                                          | tasks                                                | any                                                                     |
| Follow-ups                  | `/followups`                                      | followups                                            | any                                                                     |
| Notes                       | `/notes`                                          | notes                                                | any (ownership checked in controller)                                   |
| Calls (Plivo)               | `/calls`, `/api/plivo/webhook/*`                  | calls                                                | webhooks signature-verified since Phase 2                               |
| Calendar                    | `/calendar`                                       | tasks (calendar events are rows in `tasks`)          | any                                                                     |
| SMS-style messages          | `/messages`, `/api/lead-messages`                 | messages                                             | any                                                                     |
| Chat                        | `/api/chat`                                       | chat_conversations, chat_participants, chat_messages | any (polling, no websockets)                                            |
| Uploads                     | `/api/upload/chat-attachment`                     | – (ImageKit)                                         | any; multer memory, 10 MB                                               |
| Reports                     | `/reports`                                        | leads, followups, users                              | any; scoped in SQL by role                                              |
| Sales locations             | `/sales-locations`                                | sales_locations, user_locations                      | admin/manager; sales updates own                                        |
| Settings                    | `/settings`                                       | settings                                             | admin                                                                   |
| Audit                       | `/audit`                                          | audit_logs                                           | admin                                                                   |
| Gold rate widget            | `/gold-rate`                                      | – (Alpha Vantage, in-memory cache)                   | any; refresh = admin                                                    |
| Health                      | `/health` (legacy), `/api/v1/health/{live,ready}` | –                                                    | public                                                                  |

Mobile's `AIAgentScreen` calls `/ai/chat` and `/ai/tools`, which do not exist in this API.

## Authentication & authorization flow (since Phase 2)

Sessions and tenancy are described in `TENANCY_AND_AUTH.md`. In short:

- Login creates a server session with a 15-minute access JWT `{sub, sid, org}` and a rotating refresh token (hashed in the DB). Web receives HttpOnly cookies plus a CSRF token; mobile receives tokens in the body and keeps the refresh token in SecureStore.
- `authenticate` re-verifies the session, user, active membership and organization on every request. It then sets `req.auth` (tenant context) and the legacy `req.user`.
- Routes declare permissions with `requirePermission` / `requireScope`. Controllers bound every query by `req.auth.organizationId` and apply own/organization scope.
- Web and mobile still hide menus using the deprecated `roleId` (1/2/3) that responses keep for compatibility. This is UX only; permissions are also returned.

## Data flow

```
web (axios, lib/api.js + lib/axios.js) ─┐
mobile (fetch, services/api.ts) ────────┼─► /api/v1 registry or legacy adapters ─► services ─► repositories ─► PostgreSQL
Plivo webhooks ─────────────────────────┘                     └─► ImageKit / Plivo / SMTP / Alpha Vantage
```

The API client base URL comes from `NEXT_PUBLIC_API_BASE_URL` on web and from `EXPO_PUBLIC_API_BASE_URL` on mobile (overridable at runtime and stored on the device). `/api/v1` uses the standard envelopes; legacy adapters keep each endpoint's historical shape (see `API.md`).

## Entry points

- API: `apps/api/src/server.ts` (env validation → `app.ts` → listen, graceful shutdown). Modules are registered in `src/modules/index.ts`.
- Web: `apps/web/src/app/layout.js`, pages in `src/app/**/page.js`, auth in `src/context/AuthContext.js`.
- Mobile: `apps/mobile/index.ts` → `App.tsx` → `src/navigation/RootNavigator.tsx`, auth in `src/context/AuthContext.tsx`.
- Worker: `apps/worker/src/index.ts`.
- Migrations: `pnpm db:migrate` → `packages/database/src/cli/migrate.ts`.

## Architectural risks & technical debt

1. ~~No tenancy~~: fixed in Phase 2. Every business table is tenant-owned; see `TENANCY_AND_AUTH.md`.
2. ~~Authorization scattered~~: permissions since Phase 2; scope predicates live in repositories since Phase 3.
3. ~~Controllers own everything~~: fixed in Phase 3 (routes → controller → service → repository).
4. **Schema drift.** The schema was hand-managed in pgAdmin. `0001_baseline_schema.sql` is the reference snapshot (drift found so far: `chat_messages.file_type`, added in 0003).
5. **SDK clients are constructed at import time** (ImageKit, Plivo), so the API cannot boot without those credentials and tests need placeholders.
6. **Remaining hardening:** Plivo signatures are verified since Phase 2 (end-to-end check against the deployed URL is pending, Phase 7). The rate limiter is in-memory, and there is no helmet yet.
7. ~~Error leakage~~: fixed in Phase 2 (`serverError()` in every legacy controller).
8. ~~Legacy bugs found by lint~~: fixed in Phase 2 with regression tests (notes count query, email `resetUrl`, the `dbTest.js` script was removed).
9. **Dead code:** the old `TEXT_ARRAY` pg parser never registered (the key is `undefined`), so pg's built-in array parser has always been used, and Phase 1 keeps it.
10. ~~Mobile typecheck and web lint errors~~: fixed in Phase 2 (0 errors).
11. **Chat is polling-based**, and there is no background processing: emails are sent inline in requests.
