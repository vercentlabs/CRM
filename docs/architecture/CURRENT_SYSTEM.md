# Current System (as of Phase 1, 2026-09-28)

A snapshot of what exists, so later phases don't have to rediscover it. Paths are post-Phase-1.

## Shape

| Part   | Path          | Stack                                                                                                         | Notes                                                                                        |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| API    | `apps/api`    | Node ≥22, Express 5, ESM JavaScript, `pg`                                                                     | ~8k LOC. Controllers hold SQL + business logic. New platform code in `src/platform/*.ts`.    |
| Web    | `apps/web`    | Next.js 16 (App Router, Turbopack, React Compiler), React 19.2, Redux Toolkit (notes only), Tailwind 4, axios | JavaScript. Every page is a client component (`'use client'`).                               |
| Mobile | `apps/mobile` | Expo SDK 54, React Native 0.81, React 19.1, React Navigation 7, NativeWind 4                                  | TypeScript (strict). Own `fetch` client. EAS project configured.                             |
| Worker | `apps/worker` | TypeScript                                                                                                    | Phase 1 skeleton only; no jobs yet.                                                          |
| DB     | PostgreSQL    | `packages/database`                                                                                           | Single-tenant schema, serial integer PKs. Baseline in `migrations/0001_baseline_schema.sql`. |

Before Phase 1 the apps lived at `crm-backend/`, `c-frontend/c-frontend/crm-frontend/` and `crm-mobile/crm-mobile/crm-mobile/`, each with its own lockfile.

## Domains (API route prefix → controller)

| Domain                      | Legacy prefix                                     | Tables                                               | Guard                                 |
| --------------------------- | ------------------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| Auth                        | `/auth` (login, logout)                           | users, audit_logs                                    | public login                          |
| Users + password reset      | `/users`                                          | users, password_resets                               | admin/manager; reset endpoints public |
| Leads (+assign, +followups) | `/leads`                                          | leads, followups                                     | any user; assign = admin/manager      |
| Customers                   | `/customers`                                      | customers                                            | roles 1-3; delete = admin             |
| Opportunities               | `/opportunities`                                  | opportunities                                        | any; assign = admin/manager           |
| Tasks                       | `/tasks`                                          | tasks                                                | any                                   |
| Follow-ups                  | `/followups`                                      | followups                                            | any                                   |
| Notes                       | `/notes`                                          | notes                                                | any (ownership checked in controller) |
| Calls (Plivo)               | `/calls`, `/api/plivo/webhook/*`                  | calls                                                | webhooks public, unsigned             |
| Calendar                    | `/calendar`                                       | tasks (calendar events are rows in `tasks`)          | any                                   |
| SMS-style messages          | `/messages`, `/api/lead-messages`                 | messages                                             | any                                   |
| Chat                        | `/api/chat`                                       | chat_conversations, chat_participants, chat_messages | any (polling, no websockets)          |
| Uploads                     | `/api/upload/chat-attachment`                     | – (ImageKit)                                         | any; multer memory, 10 MB             |
| Reports                     | `/reports`                                        | leads, followups, users                              | any; scoped in SQL by role            |
| Sales locations             | `/sales-locations`                                | sales_locations, user_locations                      | admin/manager; sales updates own      |
| Settings                    | `/settings`                                       | settings                                             | admin                                 |
| Audit                       | `/audit`                                          | audit_logs                                           | admin                                 |
| Gold rate widget            | `/gold-rate`                                      | – (Alpha Vantage, in-memory cache)                   | any; refresh = admin                  |
| Health                      | `/health` (legacy), `/api/v1/health/{live,ready}` | –                                                    | public                                |

Mobile's `AIAgentScreen` calls `/ai/chat` and `/ai/tools`, which do not exist in this API.

## Authentication & authorization flow

1. `POST /auth/login` → bcrypt compare → JWT (HS256, `JWT_SECRET`, **hard-coded 24h**; `JWT_EXPIRES_IN` is unused) with `{ userId, roleId, name, email }`.
2. Web stores the token in `localStorage` (`token`); mobile in AsyncStorage keyed per API base URL. Both send `Authorization: Bearer`.
3. `middleware/auth.middleware.js` verifies the JWT and sets `req.user = { userId, roleId }` (+ request context since Phase 1). No server-side session, revocation or refresh; logout is client-side.
4. Route guards: `middleware/roleCheck.js#checkRoles([ids])` (also `role.middleware.js`, a duplicate). Roles are global integers: 1 Admin, 2 Manager, 3 Sales (now `LEGACY_ROLE_IDS` in `@crm/permissions`).
5. Record scoping lives inside controllers (`if (role === 3) … WHERE assigned_to = $userId`). It is not centralized, so each controller must be audited in Phase 2.
6. Web/mobile hide menu items by decoding the JWT (`ProtectedRoute`, `menuConfig`). This is UX only.

## Data flow

```
web (axios, lib/api.js + lib/axios.js) ─┐
mobile (fetch, services/api.ts) ────────┼─► Express routes ─► controllers (SQL via pg pool) ─► PostgreSQL
Plivo webhooks ─────────────────────────┘                     └─► ImageKit / Plivo / SMTP / Alpha Vantage
```

The API client base URL comes from `NEXT_PUBLIC_API_BASE_URL` on web and from `EXPO_PUBLIC_API_BASE_URL` on mobile (overridable at runtime and stored on the device). Responses mostly use `{ success, message, data }` from `utils/response.js`, but many controllers hand-roll `{ message }` or `{ error }`.

## Entry points

- API: `apps/api/src/server.js` (env validation → `app.js` → listen, graceful shutdown). Routes are mounted in `src/app.js`.
- Web: `apps/web/src/app/layout.js`, pages in `src/app/**/page.js`, auth in `src/context/AuthContext.js`.
- Mobile: `apps/mobile/index.ts` → `App.tsx` → `src/navigation/RootNavigator.tsx`, auth in `src/context/AuthContext.tsx`.
- Worker: `apps/worker/src/index.ts`.
- Migrations: `pnpm db:migrate` → `packages/database/src/cli/migrate.ts`.

## Architectural risks & technical debt

1. **No tenancy.** Every table is global and there is no `organization_id` anywhere.
2. **Authorization is scattered.** Role-ID arrays live on routes, and record scoping is copied across controllers. Web has 3 separate API clients (`lib/api.js`, `lib/axios.js`, `services/notesApi.js`).
3. **Controllers own everything.** They mix SQL, validation, business rules and response formatting, and `lead.controller.js` alone is 1,158 LOC. There is no service or repository layer.
4. **Schema drift.** The schema was hand-managed in pgAdmin. `0001_baseline_schema.sql` is the reference snapshot. `utils/transaction-pattern.js` references a non-existent `activity_logs` table.
5. **SDK clients are constructed at import time** (ImageKit, Plivo), so the API cannot boot without those credentials and tests need placeholders.
6. **Unsigned public webhooks** (`/api/plivo/webhook/*`), plus wide-open `cors()`, no rate limiting on login or password reset, and no helmet.
7. **Error leakage.** Many controllers return `error.message` (DB errors) in 500 bodies. The central handler covers thrown errors only.
8. **Legacy bugs found by lint** (not fixed in Phase 1 because they are behaviour changes): `notes.controller.js:93-108` reassigns a `const countQuery` (a runtime TypeError on filtered counts); `services/email.service.js:85` references an undefined `resetUrl`; `utils/dbTest.js` uses `require` in ESM.
9. **Dead code:** the old `TEXT_ARRAY` pg parser never registered (the key is `undefined`), so pg's built-in array parser has always been used, and Phase 1 keeps it. There are also dev scripts in `src/utils/*` (check/insert test users).
10. **Mobile typecheck has 10 pre-existing errors** (navigation typing, a `LinearGradient` prop, and `api.ts` header typing). Web lint has 8 pre-existing errors (mostly React Compiler rules).
11. **Chat is polling-based**, and there is no background processing: emails are sent inline in requests.
