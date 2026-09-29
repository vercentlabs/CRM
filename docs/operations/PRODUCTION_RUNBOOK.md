# Production runbook

For on-call operators. Topology and releases: [DEPLOYMENT.md](DEPLOYMENT.md). Metrics and alerts: [MONITORING.md](MONITORING.md). Recovery: [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).

## First five minutes

1. Check `https://<api>/api/v1/health/ready` and the web login page.
2. Open the "CRM production" dashboard: 5xx ratio, p95 latency, DB pool waiting, outbox age, queue backlog, rate-limit store errors.
3. Find the failing requests in logs by `level=error` and `msg=request_failed`; every response carries `x-request-id` — search logs by `requestId`.
4. Check the managed PostgreSQL and Redis consoles and the provider status pages (Plivo, ImageKit, SMTP).
5. If a release went out in the last hour, compare `crm_build_info` versions and consider a rollback ([DEPLOYMENT.md#rollback](DEPLOYMENT.md#rollback)).

## Everyday commands

| Task                                | Command                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration status                    | `DATABASE_URL=… pnpm db:migrate:status` (or from the API image: `docker run --rm -e DATABASE_URL -w /repo/packages/database <api image> node dist/cli/migrate.js status`) |
| API smoke                           | `API_URL=https://… [SMOKE_EMAIL=… SMOKE_PASSWORD=…] node scripts/smoke-api.mjs`                                                                                           |
| Worker readiness                    | `WORKER_HEALTH_URL=http://worker:8081 METRICS_TOKEN=… node scripts/smoke-worker.mjs`                                                                                      |
| Queue check                         | `pnpm queue:check` (worker config)                                                                                                                                        |
| Plivo configuration                 | `PLIVO_WEBHOOK_URL=… NODE_ENV=production pnpm plivo:check --probe`                                                                                                        |
| Create an organization + admin      | `pnpm org:bootstrap` (BOOTSTRAP_* variables)                                                                                                                              |
| Replay outbox after Redis data loss | `DATABASE_URL=… node packages/database/scripts/outbox-replay.mjs --since <ISO> [--apply]`                                                                                 |

## API down

`CrmApiDown`, uptime check failing.

1. Platform: are containers running/restarting? Read the last startup log lines — a configuration error names the variable (`… is required`, `Must be …`) and the process exits by design.
2. Readiness 503 with `database: unavailable` → see [Database saturation](#database-saturation) / provider status.
3. Readiness 503 with `process: unavailable` → the instance is shutting down (deploy in progress); should clear within 30 s.
4. Roll back if it started with a release.

## Worker down

`CrmWorkerDown`, `CrmRemindersStalled`. Effects: no reminders, emails, SMS, notifications or webhook deliveries (the API keeps working; work accumulates safely in the outbox).

1. `/health/ready` checks: `database`, `queue` (Redis reachable and durable), `relay`, `draining`.
2. Startup refused → configuration error in the log (production guards).
3. After recovery, the outbox drains automatically; watch `crm_outbox_oldest_pending_seconds` fall.

## Elevated 5xx

`CrmApiHigh5xxRate`.

1. Group `request_failed` logs at `level=error` by `route`: a single route → code/dependency issue; all routes → database or platform.
2. `error_captured` lines include the stack (never sent to clients).
3. 503s logged at `warn` are dependency outages by design (Redis for rate-limited endpoints, ImageKit for uploads, Alpha Vantage for the gold widget) — fix the dependency.
4. Roll back a bad release.

## Slow API

`CrmApiLatencyP95High`.

1. Latency by route on the dashboard; `http_request_slow` logs show route and duration.
2. DB pool `waiting` > 0 → [Database saturation](#database-saturation).
3. Dashboard summary and lead search are the known heaviest endpoints ([PERFORMANCE.md](PERFORMANCE.md)).
4. Scale API instances horizontally if CPU-bound.

## Database saturation

`CrmDbPoolExhausted`, `CrmDbErrors`.

1. Provider console: CPU, connections, locks, storage.
2. `SELECT pid, now() - query_start AS age, state, left(query, 120) FROM pg_stat_activity WHERE datname = current_database() ORDER BY age DESC LIMIT 20;`
3. Long-running query blocking others → `SELECT pg_cancel_backend(<pid>);` (never `pg_terminate_backend` on migrations).
4. Connections: API uses `DATABASE_POOL_MAX` (20) per instance; worker `WORKER_CONCURRENCY + 4`. Keep the total below the server's `max_connections` minus headroom.

## Outbox backlog

`CrmOutboxBacklog`: events are not being dispatched to queues.

1. Worker up and ready? Redis reachable? (`crm_outbox_dispatch_errors_total` rising = Redis enqueue failures.)
2. Pending by type: `SELECT event_type, count(*), min(occurred_at) FROM outbox_events WHERE processed_at IS NULL AND failed_at IS NULL GROUP BY 1;`
3. Once the cause is fixed the relay catches up (batches of `OUTBOX_BATCH_SIZE`); scale workers if sustained.

## Dead outbox events

`CrmOutboxDeadEvents`: events that exhausted `OUTBOX_MAX_ATTEMPTS` dispatches.

1. `SELECT id, event_type, attempts, last_error, failed_at FROM outbox_events WHERE failed_at IS NOT NULL ORDER BY failed_at DESC LIMIT 50;`
2. Fix the cause (usually a Redis outage that outlasted the retries), then requeue: `UPDATE outbox_events SET failed_at = NULL, attempts = 0, available_at = now() WHERE failed_at IS NOT NULL AND failed_at > now() - interval '1 day';` Processors are idempotent.

## Queue backlog

`CrmQueueBacklog`.

1. Which queue? `communications` (SMS/email), `notifications`, `webhooks`, `maintenance`.
2. Workers alive and consuming (`crm_queue_jobs{state="active"}` > 0)? Scale workers or raise `WORKER_CONCURRENCY`.
3. `webhooks` backlog usually means slow customer endpoints (10 s timeout each) — check `crm_job_duration_seconds{job_name="webhook.deliver"}`.

## Job failures

`CrmJobFailures` by `job_name`.

- `message.send`: provider rejections (invalid numbers → permanent, visible on the message as `Failed` with a failure code) or Plivo outage (retried). Check Plivo status and credentials.
- `email.*`: SMTP credentials/limits.
- `webhook.deliver`: customer endpoint failing; deliveries are visible per endpoint (last delivery status in Settings → Webhooks); after the retries the delivery is `failed`.
- `notification.event`: application bug → logs with `jobId`.
- Messages left in `Sending` by a crashed worker are settled as `Failed / DELIVERY_UNKNOWN` by the maintenance sweep and **never resent** (the provider may have delivered them).

## Redis unavailable

`CrmRateLimitStoreUnavailable`; login/refresh/password reset/invitations/sensitive writes answer 503; worker not ready.

1. Provider console; memory (policy must be `noeviction`), connections, TLS certificate.
2. Nothing to repair in the application once Redis is back: counters and queues resume, the outbox re-dispatches.
3. If Redis came back **empty** (data loss), follow [Redis data loss](BACKUP_AND_RECOVERY.md#redis-loss).

## Auth abuse

`CrmAuthFailureSpike`, `CrmRateLimitBlocksSpike`.

1. `crm_auth_failures_total` by reason; `crm_rate_limit_blocks_total` by policy.
2. Credential stuffing is contained by the per-IP and per-IP+email limits; add a WAF/IP block at the load balancer for sustained sources.
3. Never raise the limits during an attack.
4. Compromised account: suspend the membership (Settings → Members) — its sessions stop working immediately; the user resets the password (revokes every session).

## Security incident

1. Preserve logs (export the relevant window) and the database state (snapshot).
2. Rotate affected secrets ([ENVIRONMENTS.md](ENVIRONMENTS.md#secret-management-rules)); rotating `JWT_SECRET` signs everyone out.
3. Suspend affected memberships / disable users.
4. Review the audit log per organization (Settings → Audit log, or `audit_logs`).
5. Notify affected customers per the contractual/legal obligations.

## Data requests

- Export an organization's leads: Reports → export (`reports.export` entitlement).
- Business records are never deleted automatically. Operational retention (sessions, reset requests, read notifications, delivery logs, deleted-file metadata) is applied by the worker's maintenance sweep with the `*_RETENTION_DAYS` settings.
