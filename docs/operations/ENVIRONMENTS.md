# Environments and configuration

Every process validates its environment at startup (`apps/api/src/platform/env.ts`, `apps/worker/src/env.ts`) and **refuses to start** in production with unsafe values. Error messages name the variable, never its value. Complete variable lists with defaults: `apps/api/.env.example`, `apps/worker/.env.example`, `apps/web/.env.example`, `apps/mobile/.env.example`.

## Configuration matrix

`—` = not used. **bold** = required in that environment.

### API

| Variable                                               | development                 | test (CI)                 | staging / production                                                 |
| ------------------------------------------------------ | --------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                                             | development                 | test                      | **production**                                                       |
| `DATABASE_URL`                                         | local                       | disposable                | **managed Postgres**                                                 |
| `DATABASE_SSL`                                         | disable (default)           | disable                   | **verify** (default); `disable` only for a private host              |
| `REDIS_URL`                                            | empty → in-memory limiter   | `REDIS_TEST_URL` in tests | **required** (`rediss://`)                                           |
| `JWT_SECRET`                                           | any                         | fixed test value          | **≥ 32 random chars**, unique per environment                        |
| `CORS_ORIGINS`                                         | http://localhost:3000       | fixed                     | **explicit https origins, no `*`**                                   |
| `FRONTEND_URL`                                         | http://localhost:3000       | —                         | **https**                                                            |
| `AUTH_COOKIE_SECURE`                                   | false (default)             | —                         | true (default; `false` refused)                                      |
| `AUTH_COOKIE_SAMESITE`                                 | lax                         | lax                       | lax (`none` requires Secure)                                         |
| `TRUST_PROXY`                                          | —                           | —                         | **number of proxy hops** (e.g. 1)                                    |
| `STORAGE_PROVIDER`                                     | imagekit or memory          | memory                    | **imagekit** (`memory` refused)                                      |
| `IMAGEKIT_*`                                           | placeholders boot           | placeholders              | **real keys**                                                        |
| `FILE_URL_TTL_SECONDS`                                 | 600                         | 600                       | 600 (30–3600)                                                        |
| `PLIVO_AUTH_ID/TOKEN`                                  | placeholders boot           | placeholders              | **real**; placeholder token refused when `PLIVO_PHONE_NUMBER` is set |
| `PLIVO_WEBHOOK_URL`                                    | optional                    | fixed                     | **https …/api/plivo/webhook** (check: `pnpm plivo:check --probe`)    |
| `WEBHOOK_SECRET_KEY`                                   | optional (management → 503) | fixed                     | **32 bytes**, identical to the worker                                |
| `WEBHOOK_ALLOW_PRIVATE_TARGETS`                        | optional                    | —                         | refused                                                              |
| `METRICS_TOKEN`                                        | optional                    | —                         | **≥ 24 chars** (unset = `/metrics` disabled)                         |
| `LOG_LEVEL` / `LOG_FORMAT`                             | info / pretty               | warn                      | info / JSON                                                          |
| `AUTH_RATE_LIMIT_*`, `SENSITIVE_RATE_LIMIT_PER_MINUTE` | defaults                    | raised                    | defaults (10 / 900 s / 100 / 60)                                     |
| `GOLD_API_KEY`                                         | optional                    | —                         | optional (gold widget answers 503 without it)                        |
| `APP_VERSION`, `GIT_SHA`, `BUILD_TIME`                 | —                           | —                         | set by the image build                                               |

### Worker

| Variable             | development           | test             | staging / production                                                                      |
| -------------------- | --------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `REDIS_URL`          | empty → inline queue  | `REDIS_TEST_URL` | **required**; readiness requires the durable queue                                        |
| `DATABASE_SSL`       | disable               | disable          | **verify** (default)                                                                      |
| `EMAIL_PROVIDER`     | memory or smtp        | memory           | **smtp** (`memory` refused)                                                               |
| `SMS_PROVIDER`       | log / none            | fake             | **plivo** or `none` (`log` refused)                                                       |
| `STORAGE_PROVIDER`   | memory                | memory           | **imagekit**                                                                              |
| `FRONTEND_URL`       | http://localhost:3000 | —                | **https** (links in emails)                                                               |
| `WEBHOOK_SECRET_KEY` | optional              | fixed            | **required**, identical to the API                                                        |
| `METRICS_TOKEN`      | optional              | —                | ≥ 24 chars                                                                                |
| `WORKER_HEALTH_PORT` | 0                     | 0                | 8081 (image default)                                                                      |
| `*_RETENTION_DAYS`   | defaults              | —                | defaults (sessions 30, resets 7, read notifications 180, deliveries 90, deleted files 90) |

### Web and mobile

| Variable                   | Where             | Notes                                                               |
| -------------------------- | ----------------- | ------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | web **build arg** | inlined at build time; also the only extra `connect-src` in the CSP |
| `EXPO_PUBLIC_API_BASE_URL` | mobile build      | https in release builds                                             |

## Secret management rules

1. **Secrets live only in the platform's secret store** (GitHub Environments for CI/CD, the hosting provider's encrypted variables at runtime). Never in the repository, images, build args, logs, tickets or chat.
2. **Separate values per environment.** Staging never shares a secret with production.
3. `.env` files are for local development only; `.env*` is git-ignored (only `.env.example` is tracked) and excluded from Docker contexts. The release gate fails if a real env file, key or log is tracked.
4. **Generate** secrets with a CSPRNG: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` (JWT, metrics token), `randomBytes(32).toString('base64')` (`WEBHOOK_SECRET_KEY`).
5. **Rotation** (and on any suspected exposure):
   - `JWT_SECRET`: rotate → every session and CSRF token is invalidated (users sign in again).
   - `WEBHOOK_SECRET_KEY`: cannot be rotated in place today (stored endpoint secrets are encrypted with it). Procedure: deploy the new key, then have each organization rotate its endpoint secrets (`POST /webhooks/:id/rotate-secret`) — or delete and recreate endpoints.
   - Provider credentials (Plivo, ImageKit, SMTP, Alpha Vantage): rotate at the provider, update the secret store, redeploy.
   - Database/Redis passwords: create the new credential, deploy, revoke the old one.
6. **Least privilege:** the application database role owns only the CRM database; CI's deploy secrets are scoped to GitHub Environments; production requires reviewer approval.
7. **Credentials in git history** (Alpha Vantage key, historical admin credentials from before the SaaS migration) are treated as compromised: they must be rotated at the provider / disabled before launch. History is not rewritten. See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).
