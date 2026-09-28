# Tenancy and Auth (implemented in Phase 2)

These are the implementation-critical facts. Read this before touching any query, route or client auth code.

## Tenant model

- An `organizations` row is a tenant. It has an internal `id`, a public `public_id` UUID (the only id exposed in APIs), a unique `slug`, and a `status` of `active` or `suspended`.
- **Tenant-owned tables** carry `organization_id NOT NULL`: leads, followups, calls, messages, notes, tasks, customers, opportunities, sales_locations, user_locations, settings, and chat_conversations.
- `audit_logs.organization_id` is nullable because platform events (such as failed logins) have no tenant. Tenants only ever read their own rows.
- **Derived tenancy:** `chat_participants` and `chat_messages` take their tenant from `chat_conversations`, so every query checks the conversation's org and the caller's participation.
- **Global tables:** users (identities), permissions, password_resets, and built-in roles (`organization_id IS NULL`).
- **Uniqueness is per organization:** `customers (organization_id, email)`, `settings (organization_id, key)` and `user_locations (organization_id, user_id)`.
- **Child rows must share the lead's organization.** A composite FK `(organization_id, lead_id) → leads(organization_id, id)` enforces this for followups, calls, messages and opportunities.

## Memberships, roles, permissions and scopes

- The chain is: user (identity) → `organization_memberships` (unique per org+user; status `active`, `invited` or `suspended`) → role → `role_permissions (permission_key, scope)`.
- **Roles use option A.** Built-in templates (`admin`, `manager`, `sales`) are global rows with ids 1/2/3 and `is_system = true`. Organizations can add their own roles (`organization_id` set). A trigger rejects a membership whose role belongs to another organization.
- **Permission vocabulary:** `@crm/permissions` (`crm.<resource>.<action>`, `settings.<area>.<action>`) is the single source of truth. Migration 0002 seeds the `permissions` table and the built-in grants from it, and a test asserts the DB matches the code. Adding a permission means updating the package and adding a new migration.
- **Scopes:** `own` or `organization`, stored per grant. `team` is reserved and not implemented, because no reliable team relationship exists; unknown scopes fail closed to `own`. What counts as "own" depends on the resource:
  - leads and opportunities: `assigned_to = me OR (assigned_to IS NULL AND created_by = me)`
  - customers, tasks, followups: `assigned_to = me`
  - notes: `created_by = me`
  - calls and messages: `user_id = me`
  - reports: filtered by the same owner columns
- **Escalation guard:** members can only grant roles, or manage members, whose grants they already cover (`coversGrants`). Members cannot change their own membership.
- **`users.role_id` is DEPRECATED.** It is nullable, no longer written, and never read for authorization. Responses still include `roleId` (from `roles.legacy_role_id`, 1/2/3, or null for custom roles) because the web and mobile menus still use it. Drop both in Phase 3/4.

## Authentication and sessions

- **Login:** `POST /api/v1/auth/login {email, password, organizationId?, client: 'web'|'mobile'}`. Legacy `POST /auth/login` still works (mobile-style tokens).
  - Every failure returns the same generic 401 `Invalid email or password`: wrong password, unknown email (timing-equalized with bcrypt), disabled user, or no active membership.
  - An explicit `organizationId` without an active membership there returns 403.
- **Sessions:** each login creates an `auth_sessions` row (user, active organization, client, user agent, `expires_at` = now + `SESSION_TTL_DAYS` (30), `revoked_at`).
- **Access token:** HS256 JWT with `{sub, sid, org, typ:'access'}`, `iss=crm-api`, `aud=crm`, and a TTL of `ACCESS_TOKEN_TTL_SECONDS` (900). It carries no role or permissions. **Every request re-verifies in one query:** the session is live, the user is active, the membership in `org` is active, the org is active, and the role grants are loaded. Pre-Phase-2 tokens have no `sid` and get 401.
- **Refresh tokens:** 32 random bytes (base64url). Only the SHA-256 goes in `auth_refresh_tokens`.
  - Rotation happens on every refresh (`FOR UPDATE`), and the old row gets `rotated_at`.
  - Presenting a rotated token again outside `REFRESH_REUSE_GRACE_SECONDS` (10s, which covers concurrent browser tabs) revokes the whole session (reuse detection).
  - Refresh re-checks the membership and user and revokes the session if access has gone.
- **Logout** (`/api/v1/auth/logout`, legacy `/auth/logout`) sets `revoked_at`. It accepts the access token, or the refresh token if the access token has already expired.
- **Revocation triggers:** logout, refresh-token reuse, password reset (all of the user's sessions), membership suspension (that org's sessions), and access loss detected at refresh.
- **Active organization:** stored on the session and bound into the token `org` claim. `POST /api/v1/auth/switch-organization {organizationId}` verifies an active membership, updates the session and issues a new access token; old tokens for the previous org then fail. Request bodies are never trusted for tenancy.

## Web (cookies)

- `client:'web'` sets two cookies:
  - `crm_at` (access): HttpOnly, `Path=/`, `Max-Age` = access TTL.
  - `crm_rt` (refresh): HttpOnly, `Path=/api/v1/auth`.
- Both are `Secure` in production (`AUTH_COOKIE_SECURE`), use `SameSite=AUTH_COOKIE_SAMESITE` (default `lax`), and take an optional `AUTH_COOKIE_DOMAIN`. Neither token is ever in a response body or JS storage.
- **CSRF:** the response body carries `csrfToken` = HMAC(session id). Cookie-authenticated unsafe requests must send it as `x-csrf-token` or get 403. `/refresh` and `/login` are exempt. Bearer requests are not CSRF-checked.
- **CORS:** origins in `CORS_ORIGINS` (else `FRONTEND_URL`) get `credentials: true`; any other origin keeps the old `*` without credentials, so only bearer tokens work there.
- **Client:** `apps/web/src/lib/api.js` is the single axios client (`withCredentials`, CSRF header, one shared refresh then retry on 401). `lib/axios.js` re-exports it, and `AuthContext` restores the session from `GET /api/v1/auth/session`. `useAuth().token` is only a non-secret "authenticated" marker. Any leftover localStorage `token` is purged.

## Mobile (bearer)

- Mobile uses `client:'mobile'`, and tokens come back in the body.
- The refresh token is kept in **Expo SecureStore** (Keychain/Keystore), keyed per API base URL. The access token lives in memory only. The old AsyncStorage `crm.token:*` key is purged.
- `services/api.ts` refreshes once on 401 (single-flight), stores the rotated pair and retries. Logout posts the refresh token so the server revokes the session.
- `expo-secure-store` is a native module, so installed builds need a new EAS build.

## Server primitives (use these, never ad-hoc checks)

- `authenticate` (`src/platform/auth/middleware.ts`) handles authentication plus verified tenant context. It sets `req.auth` (`AuthSubject`: userId, sessionId, organizationId, organizationPublicId, membershipId, roleKey, permissions), sets `req.user` (legacy `{userId, roleId, email, name}`), and fills the AsyncLocalStorage context `auth`.
- `requirePermission(p)`, `requireAnyPermission(...p)` and `requireScope(p, 'organization')` all answer 403 with a generic message and no role details.
- Services obtain the tenant only through `actorFrom(req.auth)` and `ownerFilter(actor, p)` / `assertMember` / `filterActiveMembers` from `src/platform/tenancy.ts` (Phase 3). Repositories take `(db, tenant, …)`, every read, update or delete includes `organization_id = $n`, and inserts take `organization_id` from `tenant`. Foreign ids from the body (assignees, lead_id, location_id, chat participants) are validated inside the organization.
- **IDOR rule:** a record in another organization answers **404**. A record in the same organization but outside the caller's scope answers 403 (legacy behavior).
- **Audit:** `recordAuditEvent()` (`src/platform/audit.ts`) stamps organization, actor, request id, IP and user agent from context and redacts password, token, hash and key fields.
- **Rate limiting:** an in-memory per-IP+email limiter covers login, refresh and password reset (`AUTH_RATE_LIMIT_MAX` per `AUTH_RATE_LIMIT_WINDOW_SECONDS`). Phase 7 moves it to a shared store.
- **Plivo:** webhooks require a valid `X-Plivo-Signature-V3` over `PLIVO_WEBHOOK_URL` + suffix (SDK `validateV3Signature`). They fail closed when the URL is not configured.

## Migrations and backfill

- **0002** adds the identity model, sessions and seeds.
- **0003** adds tenant columns and runs the backfill:
  - If any data exists, it creates one organization (public id `00000000-0000-4000-8000-000000000001`, slug `default`, named from `settings.site_name`).
  - It adds every user as a member with the role matching `users.role_id` (inactive users become `suspended` members) and assigns every row to that organization.
  - It then validates that no NULLs remain, sets `NOT NULL`, and adds the per-org uniques, composite FKs and indexes. It also drops the unused cross-tenant views, functions and procedure, plus the legacy note trigger.
  - On an empty database it creates no organization; use `pnpm org:bootstrap`.
- Both migrations run in one transaction per file through the existing forward-only runner. The only DELETE (ownerless default settings on an empty install) carries the review marker.
