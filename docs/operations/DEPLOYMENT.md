# Deployment

How the CRM runs in production and staging, how a release is rolled out and rolled back.
Configuration per environment: [ENVIRONMENTS.md](ENVIRONMENTS.md). Day-2 operations: [PRODUCTION_RUNBOOK.md](PRODUCTION_RUNBOOK.md).

## Topology

No Kubernetes, no microservices. Three stateless containers plus managed data services:

```
                 HTTPS (TLS 1.2+, HSTS)            private network
 browser ──► CDN / load balancer ──► web (Next.js, N≥1)
 mobile  ──►        │
 Plivo   ──►        └──────────────► api (Express, N≥2) ──► PostgreSQL 16 (managed, TLS, PITR)
                                         │                 ▲
                                         └──► Redis 7 ◄────┤ (TLS, AOF, noeviction)
                                                           │
                                           worker (N≥1) ───┘  ──► SMTP, Plivo, ImageKit, customer webhooks
```

| Component  | Image                                     | Scaling                                                    | Health                                                                                                                    |
| ---------- | ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| web        | `infrastructure/docker/web.Dockerfile`    | stateless, ≥1                                              | `GET /login`                                                                                                              |
| api        | `infrastructure/docker/api.Dockerfile`    | stateless, ≥2 behind the LB                                | liveness `/api/v1/health/live`, readiness `/api/v1/health/ready` (database only; Redis is **not** a readiness dependency) |
| worker     | `infrastructure/docker/worker.Dockerfile` | ≥1; replicas share queues, schedules and the outbox safely | `WORKER_HEALTH_PORT` → `/health/live`, `/health/ready` (database, durable Redis queue, outbox relay, not draining)        |
| PostgreSQL | managed (16.x)                            | vertical; read replicas not required                       | provider monitoring                                                                                                       |
| Redis      | managed (7.x)                             | single primary with replica                                | provider monitoring                                                                                                       |

Requirements on the managed services:

- **PostgreSQL:** TLS enforced, automated daily snapshots and point-in-time recovery (WAL archiving), deletion protection, private networking. The application role owns the schema (migrations run with it).
- **Redis:** TLS (`rediss://`), persistence (AOF `everysec`), `maxmemory-policy noeviction` (BullMQ requirement — eviction silently deletes jobs), private networking, a password.
- **Load balancer / reverse proxy:** TLS termination, HTTP→HTTPS redirect, **gzip/brotli compression** (the API does not compress — delegated here), request body limit ≥ 11 MB for uploads, idle timeout < 65 s (API keep-alive is 65 s), forwarding `X-Forwarded-For`. Set `TRUST_PROXY=1` (number of trusted hops) on the API so rate limits see client IPs.
- **Outbound network:** the worker must reach SMTP, Plivo, ImageKit and customers' HTTPS webhook endpoints; the API must reach Plivo, ImageKit and Alpha Vantage.

## Environments

|                | staging                                                  | production                                                                         |
| -------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Purpose        | release rehearsal on production-like infrastructure      | customers                                                                          |
| Data           | synthetic tenants only — never a copy of production data | real                                                                               |
| Infrastructure | same images, same topology, smaller sizes                | as above                                                                           |
| Providers      | Plivo/ImageKit/SMTP **test** accounts or sandboxes       | live accounts                                                                      |
| Deploy         | `Deploy` workflow → `staging` (no approval)              | `Deploy` workflow → `production` (required reviewers, main only, confirmed backup) |
| Secrets        | separate values; nothing shared with production          | separate values                                                                    |

A release goes to staging first; production deploys the **same version** after the staging smoke passes.

## Release process

1. Merge to `main` with a green CI (release gate, E2E, Docker builds, mobile bundle, security).
2. Run **Actions → Deploy** with `environment=staging`, `version=X.Y.Z`.
3. Verify staging: smoke output, dashboards, a manual pass of the critical paths.
4. Take/confirm a fresh production snapshot (the workflow requires `confirm_backup` for production).
5. Run **Deploy** with `environment=production` and the same version. A reviewer approves the environment.

The workflow:

1. builds and pushes `ghcr.io/<repo>/{api,worker,web}:X.Y.Z` (+ `:<git sha>`) with `APP_VERSION`, `GIT_SHA`;
2. runs `migrate status → up → status` from the new API image (forward-only, checksummed, advisory-locked — safe with running old instances because every migration is additive);
3. triggers the API and worker deploy hooks and waits until `/api/v1` reports the new version;
4. triggers the web deploy hook;
5. runs `scripts/smoke-api.mjs` (health, readiness, build version, security headers, CORS, auth rejection, metrics protection, and a login/read with the smoke account).

Worker readiness is checked by the platform health check or `scripts/smoke-worker.mjs` from inside the private network.

## Migrations

- Forward-only and additive. `packages/database/migrations.lock.json` pins the checksum of every file; CI fails if an applied migration is edited. New migration: add `NNNN_name.sql`, then `pnpm --filter @crm/database migrations:lock`.
- Destructive statements require the `-- crm:allow-destructive` marker and review.
- Expand → deploy → contract: code tolerates both the old and new schema during a rollout; removals ship one release later.

## Rollback

| Situation                                          | Action                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bad application code, schema unchanged or additive | Redeploy the previous version's images (`:<previous version>` in GHCR) via the platform or the deploy hooks. No database action.                                                                                      |
| Bad migration (additive)                           | Leave it applied; roll the app back; fix forward with a new migration.                                                                                                                                                |
| Data corruption / destructive mistake              | Stop writers (scale API and worker to 0), restore to a new database with PITR to just before the incident, verify ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)), repoint `DATABASE_URL`, start API, then worker. |
| Bad web release                                    | Redeploy the previous web image.                                                                                                                                                                                      |

Never run `migrate down` — there is none, by design.

## Graceful shutdown

- **API:** on SIGTERM it marks itself shutting down (readiness → 503 so the LB stops routing), waits `SHUTDOWN_DRAIN_MS` (5 s), stops accepting connections, lets in-flight requests finish, closes Redis and the pool, exits 0; forced exit after `SHUTDOWN_TIMEOUT_MS` (25 s). Platform stop timeout must be ≥ 30 s.
- **Worker:** readiness reports `draining`, the relay stops claiming outbox events, consumers finish active jobs (bounded by `WORKER_SHUTDOWN_TIMEOUT_MS`), Redis and the database close. Interrupted jobs are retried; processors are idempotent.
- Verified on the built images: `docker stop` → both exit 0 in ~5 s with `server_stopping/server_stopped` and `worker_stopping/worker_stopped` logs.

## Local production-like run

```bash
docker build -f infrastructure/docker/api.Dockerfile --build-arg APP_VERSION=1.0.0 --build-arg GIT_SHA=$(git rev-parse HEAD) -t crm-api .
docker build -f infrastructure/docker/worker.Dockerfile -t crm-worker .
docker build -f infrastructure/docker/web.Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t crm-web .
API_URL=http://127.0.0.1:5000 node scripts/smoke-api.mjs
WORKER_HEALTH_URL=http://127.0.0.1:8081 node scripts/smoke-worker.mjs
```
