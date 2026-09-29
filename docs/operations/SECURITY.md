# Security

Security model of the CRM and the Phase 7 launch review. Report vulnerabilities privately to the maintainers (security contact: operator to define before launch — see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)); never in public issues.

## Model

- **Multi-tenant, shared database.** Every tenant-owned row carries `organization_id`; repositories take a `Tenant` built only from the verified session and bind it in every statement (architecture tests fail otherwise). Foreign ids answer **404**, never 403, so existence does not leak. Worker jobs carry `organizationId` and every worker query binds it.
- **Authorization** = permission (role grants with `own`/`organization` scope, `@crm/permissions`) **and** entitlement (plan features/limits, `@crm/entitlements`). Enforced by the API route registry before validation; clients only hide UI.
- **Identity** is global (one user, many organizations); sessions are bound to one organization.

## Authentication and sessions

- Passwords: bcrypt cost 12; generic "Invalid email or password" for unknown users, wrong passwords, disabled users and suspended memberships.
- Access tokens: 15-minute JWT bound to a server-side session (`sid`), organization and user; every request re-verifies session, membership and organization status in the database.
- Refresh tokens: random, stored as SHA-256, **rotated on every use**; reuse of a rotated token revokes the session (a 10 s grace window absorbs concurrent tabs). Parallel refreshes rotate at most once (tested).
- Web: HttpOnly cookies — `crm_at` (path `/`) and `crm_rt` (path `/api/v1/auth` only), `Secure` in production (forced), `SameSite=Lax`. **CSRF**: cookie-authenticated POST/PUT/PATCH/DELETE must send `x-csrf-token` (HMAC of the session id); bearer clients are exempt (tested for every method).
- Mobile: access token in memory, refresh token in Expo SecureStore (Keychain/Keystore).
- Password reset: generic response whether or not the email exists; the token is created by the worker at send time, stored only as a hash, expires in 1 hour, single use; a reset revokes every session and refresh token; tokens never appear in logs (tested).
- Session cleanup: the worker's maintenance sweep deletes sessions (and their refresh tokens) expired or revoked more than `SESSION_RETENTION_DAYS` ago, expired refresh tokens, and used/expired reset requests after `PASSWORD_RESET_RETENTION_DAYS`.

## Rate limiting (shared, Redis)

Fixed-window counters in Redis (atomic Lua), keys are SHA-256 hashes (no emails or IPs stored). **Fails closed** in production: if Redis is unreachable the protected endpoints answer 503 rather than allowing unlimited attempts (metric + page alert). In-memory store only in development/tests.

| Policy                                                                                              | Key                   | Limit                                        |
| --------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------- |
| login                                                                                               | IP + normalized email | `AUTH_RATE_LIMIT_MAX` (10) / 15 min          |
| login                                                                                               | IP                    | `AUTH_RATE_LIMIT_IP_MAX` (100) / 15 min      |
| refresh                                                                                             | IP                    | 6 × `AUTH_RATE_LIMIT_MAX` / 15 min           |
| password forgot/reset/verify                                                                        | IP + email, IP        | as login                                     |
| invitation acceptance                                                                               | user (or IP)          | 20 / 15 min                                  |
| sensitive writes: member add/update, profile, uploads, single and bulk messages, webhook management | user (or IP)          | `SENSITIVE_RATE_LIMIT_PER_MINUTE` (60) / min |

429 responses carry `Retry-After` and do not reveal which key tripped.

## HTTP hardening

- **API:** helmet with `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, COOP same-origin, CORP same-site, HSTS (production), no `X-Powered-By`; `Cache-Control: no-store` on every `/api/v1` response; `X-CRM-Version`.
- **CORS:** production allows credentials only for the explicit `CORS_ORIGINS` https allow-list; other origins get no CORS headers (tested with foreign, http and `null` origins).
- **Web (Next.js):** CSP `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (required by App Router hydration without per-request nonces), `connect-src 'self' <API origin>`, `img-src 'self' data: blob: https:` (signed attachment URLs), `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`; HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer, `Permissions-Policy` (camera/microphone/payment off, geolocation self). No secrets in `NEXT_PUBLIC_*`.
- Body limits: JSON 1 MB, uploads 10 MB with magic-byte type checks, Plivo webhooks 100 KB.
- Errors: stack traces and internal messages never reach clients in any environment.

## Files

- Uploads: allow-listed MIME types verified against file content; storage keys generated server-side (`organizations/<org public id>/chat/attachments/<uuid><ext>`); user filenames are sanitized display names only; per-plan storage limits.
- **Access:** tracked attachments are served through **short-lived signed URLs** (`FILE_URL_TTL_SECONDS`, 10 min): chat message reads return a signed `attachment_url`; `GET /api/v1/files/:id/url` issues a fresh one. Only the uploader or a participant of the conversation may obtain it; other members, admins without participation, other tenants, deleted files and guessed ids get an identical 404.
- **Enforcement at the provider** requires ImageKit's "Restrict unsigned URLs" setting (operator action). Until it is enabled, the unsigned URL of an object remains readable by anyone who has it.
- **Historical public URLs:** chat attachments uploaded before file tracking (Phase 6) have their permanent public URL stored in `chat_messages.attachment_url`; they cannot be re-signed without the provider file id and remain accessible to anyone holding the URL. After enabling restricted URLs at ImageKit, those links stop working (intended); if they must stay available, re-upload them.
- Deletion: metadata first (message detached, usage released), provider object removed asynchronously with retries.

## Outbound webhooks

- Managed only with `settings.integrations.manage` (Admin; grantable to custom roles; not Manager/Sales).
- Targets: HTTPS only, no credentials in the URL, every resolved address must be public (checked on create/update **and** before every delivery — DNS rebinding safe); redirects are not followed; 10 s timeout.
- Event allow-list: only the documented CRM events (`GET /api/v1/webhooks/event-types`); platform events (e.g. password resets) can never be subscribed.
- Secrets: `whsec_` + 32 random bytes, **shown once** (create/rotate), stored AES-256-GCM-encrypted with `WEBHOOK_SECRET_KEY`, never returned, logged or audited. Deliveries are signed: `x-crm-signature: v1=HMAC-SHA256(secret, "<x-crm-timestamp>.<body>")`.
- At most 10 endpoints per organization; payloads carry the organization's public id and entity ids.

## Provider webhooks (Plivo)

`/api/plivo/webhook/{answer,recording,status,message-status}` verify `X-Plivo-Signature-V3` against `PLIVO_WEBHOOK_URL` + the auth token; unsigned or mis-signed requests get 403. `pnpm plivo:check --probe` confirms each public URL rejects unsigned requests. Call answer and hangup URLs are sent with every call; SMS reports with every message.

## Logging and privacy

Central redaction ([MONITORING.md](MONITORING.md#logs)); no passwords, tokens, secrets, message bodies or phone numbers in logs; audit log values are redacted. Metrics carry no tenant or user identifiers.

## Supply chain and repository

- `pnpm install --frozen-lockfile` everywhere (CI, Docker); lockfile committed.
- CI security workflow: gitleaks on new commits (PRs/pushes) and weekly full history; `pnpm audit --prod --audit-level high`; tracked-file hygiene (no `.env`, keys, logs, dumps, build output).
- Images: `node:22-alpine`, non-root `node` user, production dependencies only, health checks, build metadata labels.

## Dependency audit (Phase 7)

`pnpm audit --prod` went from **90 advisories (3 critical, 34 high)** to **4 (2 high, 2 moderate, 0 critical)**:

- Upgraded: `next` 16.1.3 → 16.3.6 (incl. critical RCE advisories in the image optimizer), `nodemailer` 6 → 10.0.11 (verified by sending through a real SMTP server), `axios` 1.13.2 → 1.20.0 (workspace override), `@react-navigation/native` → 7.4.1 (resolves the long-standing peer warning), `@types/react` 19.3 for web.
- Overridden within API-compatible lines (`pnpm-workspace.yaml`): `form-data` 2.5.6, `qs` ≥ 6.16, `tough-cookie` 4.1.4 (plivo → `request` chain), `postcss` ≥ 8.5.28 (Expo tooling).
- Hardening: the Next.js image optimizer is disabled (`images.unoptimized`; `next/image` is not used).
- pnpm's minimum-release-age policy is respected (no exclusions were added for these upgrades).

Accepted residual findings (re-evaluate on every dependency update):

| Package                                                          | Severity | Path                | Why accepted                                                                                                                                  |
| ---------------------------------------------------------------- | -------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `request` (SSRF on redirects)                                    | moderate | `plivo` SDK         | no patched release exists (deprecated); our code calls Plivo through the SDK's axios client with fixed Plivo URLs, never user-controlled URLs |
| `uuid` < 11.1.1 (buffer bounds in v3/v5/v6 with a caller buffer) | moderate | `plivo` → `request` | `request` only uses v4 without a buffer; the fix is a breaking major that `request`'s deep imports cannot load                                |
| `image-size` ≤ 2.0.2 (DoS parsing ICNS/JXL/HEIF) ×2              | high     | Expo build tooling  | runs only at build time on the app's own assets, never on user input; the fix is a breaking major inside Expo's tooling                       |

## Phase 7 security review

| Area       | Checked                                                                                                                                                                                                                                              | Result                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser    | cookies (HttpOnly/Secure/SameSite/path), CSRF on every unsafe method, CORS allow-list, CSP and security headers, no secrets in `NEXT_PUBLIC_*`, session state cleared on organization switch and sign-out (E2E)                                      | PASS                                                                                                                                                                                                                                            |
| Mobile     | refresh token in SecureStore, access token in memory, https API in release builds, **Android cleartext now allowed only for http development API URLs** (was always on — fixed in `apps/mobile/app.config.js`)                                       | PASS after fix                                                                                                                                                                                                                                  |
| API        | tenant isolation suites, registry-wide authorization matrix (Admin/Manager/Sales/custom role), entitlement matrix, pagination bounds, rate limits (Redis, fail closed), production env guards, error hygiene, signed file access, webhook SSRF guard | PASS                                                                                                                                                                                                                                            |
| Worker     | tenant-bound queries (architecture test), idempotent processors under concurrency, no secrets/bodies in logs or Redis, production env guards, durable-queue readiness, SSRF re-check per delivery                                                    | PASS                                                                                                                                                                                                                                            |
| Repository | secret scan of tracked files                                                                                                                                                                                                                         | PASS for the working tree; **git history contains credentials committed before the SaaS migration** (Alpha Vantage API key, historical admin credentials) — history is not rewritten; the credentials must be rotated/disabled (launch blocker) |

## Production environment guards (fatal at startup)

API: `JWT_SECRET` ≥ 32 chars; Secure cookies; explicit https `CORS_ORIGINS` (no `*`); https `FRONTEND_URL`; `REDIS_URL`; no memory storage; no private webhook targets; DB TLS not disabled for remote hosts; https `PLIVO_WEBHOOK_URL` ending in `/webhook`; `METRICS_TOKEN` ≥ 24 chars; well-formed `WEBHOOK_SECRET_KEY`; no placeholder Plivo token with calling enabled.
Worker: `REDIS_URL`; SMTP email (no memory); no log SMS; ImageKit storage; `WEBHOOK_SECRET_KEY`; https `FRONTEND_URL`; `METRICS_TOKEN` ≥ 24; DB TLS not disabled for remote hosts; no private webhook targets.
Covered by `apps/api/test/production-config.test.ts` and `apps/worker/src/env.test.ts`.
