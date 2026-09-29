# Backup and recovery

PostgreSQL is the only source of truth. Redis holds queues and rate-limit counters only (no business state). Object storage (ImageKit) holds uploaded files; their metadata is in PostgreSQL.

## Objectives

|                                   | Target                                                                       | How                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **RPO** (max data loss)           | ≤ 5 minutes                                                                  | managed PostgreSQL point-in-time recovery (continuous WAL archiving)               |
| **RTO** (time to restore service) | ≤ 1 hour                                                                     | restore to a new instance, verify, repoint `DATABASE_URL`, restart API then worker |
| Snapshot retention                | daily snapshots, 30 days; monthly snapshot kept 12 months                    | provider policy                                                                    |
| Logical backups                   | weekly `pg_dump -Fc` to separate storage (different account/region), 90 days | scheduled job                                                                      |

These are targets for the managed setup in [DEPLOYMENT.md](DEPLOYMENT.md). They are met only once the operator has enabled PITR and confirmed a restore drill (see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)).

## What is backed up

| Data                                                                                                                                                             | Where                 | Backup                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tenants, users, memberships, roles, subscriptions, CRM records, settings, audit log, outbox, notifications, file metadata, webhook endpoints (secrets encrypted) | PostgreSQL            | snapshots + PITR + weekly logical dump                                                                                      |
| Uploaded files                                                                                                                                                   | ImageKit              | provider durability; enable ImageKit backups if available. Lost objects surface as broken attachments, not data corruption. |
| Queues, rate-limit counters                                                                                                                                      | Redis                 | AOF persistence; **not** part of backups (rebuildable, see Redis loss)                                                      |
| Secrets                                                                                                                                                          | platform secret store | managed by the operator (keep an offline, access-controlled record of how to regenerate each)                               |

`WEBHOOK_SECRET_KEY` is required to read webhook secrets in a restored database: without the same key, organizations must rotate their endpoint secrets.

## Verified restore procedure

`packages/database/scripts/backup-restore-verify.mjs` proves the dump/restore format end to end on a disposable server:

1. creates a two-tenant database from all migrations (a user in both organizations, subscriptions, leads, tasks, settings, pending outbox events, sessions);
2. `pg_dump -Fc --no-owner --no-privileges` (the logical backup format);
3. `pg_restore --exit-on-error` into a fresh database;
4. compares every table's row count, per-organization rows of every tenant table, memberships with roles, subscriptions with plans, pending outbox events, migration history with checksums and role grants; checks every tenant-owned row still has its organization and every constraint is valid;
5. drops both databases.

```bash
VERIFY_ADMIN_URL=postgresql://user:pass@host:5432/postgres \
  [PG_DOCKER_CONTAINER=<postgres container>] node packages/database/scripts/backup-restore-verify.mjs
```

It runs in CI on every pull request and push to main. Last local run (Phase 7, PostgreSQL 16.15 in Docker): all 9 checks PASS — 35 tables, 370 rows, 8 migrations; dump 157 KB in 0.2 s, restore 1.6 s.

### Restoring production

1. **Declare the incident**, stop writers: scale the worker to 0, then the API to 0 (or enable maintenance at the load balancer).
2. **Restore to a new instance** — never over the damaged one:
   - PITR: restore to a timestamp just before the incident.
   - Logical: `createdb crm_restore && pg_restore --no-owner --exit-on-error -d crm_restore backup.dump`.
3. **Verify** on the restored instance:
   - `DATABASE_URL=<restored> pnpm db:migrate:status` — every migration applied, checksums match;
   - row counts of `organizations`, `organization_memberships`, `subscriptions`, `leads` against the last known values (dashboards/metrics);
   - no tenant-owned rows without `organization_id` (the query in the verify script);
   - log in as a smoke account in each of two tenants.
4. **Repoint** `DATABASE_URL` (API and worker), start the API, run `scripts/smoke-api.mjs`, then start the worker and run `scripts/smoke-worker.mjs`.
5. **Outbox**: events after the restore point are gone with the data; events before it that were already processed are not replayed (their effects — emails, SMS — already happened). Do **not** replay after a database restore.
6. Keep the damaged instance for forensics until the post-incident review closes.

## Disaster scenarios

| Scenario                                                               | Impact                                                                                                                                                                                                                    | Response                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API instance crash                                                     | none (≥2 instances behind the LB)                                                                                                                                                                                         | platform restarts it                                                                                                                                                                                                                                                                                                                                                                                    |
| Worker crash                                                           | background work pauses; nothing lost (outbox claims expire after `OUTBOX_LEASE_SECONDS`, jobs are retried, interrupted SMS sends are settled as `DELIVERY_UNKNOWN` by the maintenance sweep — never resent)               | platform restarts it                                                                                                                                                                                                                                                                                                                                                                                    |
| **Redis unavailable**                                                  | API keeps serving; rate-limited endpoints (login, refresh, password reset, invitations, sensitive writes) answer **503** (fail closed); the outbox keeps events and retries dispatch with backoff; worker readiness fails | restore Redis; everything resumes automatically                                                                                                                                                                                                                                                                                                                                                         |
| <a id="redis-loss"></a>**Redis data loss** (flushed/replaced instance) | rate-limit counters reset (harmless); jobs dispatched but not yet run are lost                                                                                                                                            | 1. Note the time of the loss. 2. `DATABASE_URL=… node packages/database/scripts/outbox-replay.mjs --since <time before the loss>` (dry run), then with `--apply`. 3. The relay re-dispatches; processors are idempotent (messages, notifications, emails, webhook deliveries are not duplicated — covered by `apps/worker/src/outbox.test.ts`). Recurring schedules are recreated when a worker starts. |
| PostgreSQL primary failure                                             | full outage                                                                                                                                                                                                               | managed failover; if unavailable, restore procedure above                                                                                                                                                                                                                                                                                                                                               |
| Region loss                                                            | full outage                                                                                                                                                                                                               | restore the latest cross-region logical dump or snapshot copy in another region; RPO then equals the dump age (≤ 7 days) unless cross-region PITR/replica is configured                                                                                                                                                                                                                                 |
| ImageKit outage                                                        | uploads fail with 503, existing attachments may not load                                                                                                                                                                  | wait for the provider; nothing to restore                                                                                                                                                                                                                                                                                                                                                               |
| Compromised secret                                                     | —                                                                                                                                                                                                                         | rotate per [ENVIRONMENTS.md](ENVIRONMENTS.md#secret-management-rules)                                                                                                                                                                                                                                                                                                                                   |

## Drills

- Quarterly: restore the latest production snapshot into staging's network (never exposed), run the verification steps, record duration against the RTO.
- On every pull request: `backup-restore-verify.mjs` (CI).
