# Performance review (Phase 7)

Measured, not estimated. Reproduce with the commands below; always state the environment next to the numbers.

## Environment

- Local workstation: Intel Core i5-12400F (12 threads), 16 GB RAM, Windows 11, Node.js 24.18.
- PostgreSQL 16.15 and Redis 7 in Docker Desktop (default settings, no tuning).
- One API process in `NODE_ENV=production` (Redis rate limiting, JSON logs at `warn`), load generator on the same machine.
- These are **single-instance, same-host** numbers: they show relative costs and regressions, not production capacity.

## Seeded volume

`packages/database/scripts/perf-explain.mjs --seed` (disposable database whose name contains `perf`) seeds one large and one small organization:

leads 200 000 · tasks 100 000 · notifications 500 000 · messages 190 000 · auth sessions 100 000 · audit logs 200 000 · webhook deliveries 200 000 · chat messages 100 000 (100 conversations), 60 users.

## Query plans (`EXPLAIN (ANALYZE, BUFFERS)`)

| Query (copied from the repositories)                              |      ms | Plan                                                                                              |
| ----------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------- |
| leads: org list, newest first (admin)                             |    0.94 | index `idx_leads_org_created`, limit                                                              |
| leads: count for pagination                                       |   15.16 | index-only scan `idx_leads_org_assigned`                                                          |
| leads: own scope (sales)                                          |    4.06 | index + filter                                                                                    |
| leads: status filter, page 50                                     |    2.49 | index                                                                                             |
| leads: search (`ILIKE '%…%'` on name/email/phone)                 |   68.99 | parallel sequential scan of `leads` (leading wildcard)                                            |
| tasks: org list by due date                                       |    0.08 | `idx_tasks_org_due`                                                                               |
| notifications: my recent                                          |    0.08 | `idx_notifications_user_recent`                                                                   |
| notifications: unread count                                       |    0.31 | partial `idx_notifications_user_unread`                                                           |
| audit log: org page                                               |    0.07 | `idx_audit_logs_org_created`                                                                      |
| chat: conversation messages (+ attached file join)                |    2.01 | `idx_chat_messages_conversation` (users/files seq-scanned only because they are tiny in the seed) |
| webhooks: list with last delivery (lateral)                       |    0.76 | `idx_webhook_deliveries_org_created` per endpoint (5 endpoints, 40 k deliveries each)             |
| reminders: follow-ups due (all orgs)                              |    1.68 | partial `idx_leads_next_call_assigned`                                                            |
| reminders: tasks due (all orgs)                                   |    0.05 | partial `idx_tasks_open_due`                                                                      |
| maintenance: stale `Sending` messages                             |    0.79 | `idx_messages_org_status`                                                                         |
| retention: sessions / read notifications / deliveries (first run) | 1.5–2.1 | limit reached early                                                                               |
| session: organization + time zone setting                         |    0.03 | primary key + `settings (organization_id, key)`                                                   |

Steady state for the retention scans (after the first purge nothing matches, so the `LIMIT` never short-circuits): sequential scans of 8.0 ms (sessions, 58 k rows), 11.0 ms (webhook deliveries, 30 k) and 15.0 ms (notifications, 241 k) — once per maintenance interval (15 min).

### Decisions

- **No new indexes (no 0009 migration).** Every interactive query is served by an existing index in ≤ 5 ms except search. The maintenance scans cost < 40 ms per 15 minutes; indexes on `notifications.read_at`, `auth_sessions.expires_at` or delivery `updated_at` would add write cost on hot tables for no user-visible gain. Revisit when a single tenant exceeds ~1 M leads or notifications.
- **Lead search** (69 ms at 200 k leads in one tenant) is acceptable for launch. Post-launch option if it becomes slow: `pg_trgm` GIN indexes on `full_name`/`email`/`mobile_number` (additive migration).
- **Pagination counts** (15 ms) are acceptable; they run in parallel with the page query.

## N+1 review

- All list endpoints load their joins in the page query (assignee names, locations, participants, last delivery); no per-row queries.
- Loops that write per item are bounded and transactional: bulk SMS (≤ 500 leads, one transaction: message row + outbox event per lead) and settings updates (≤ 100 keys).
- Worker scans are single set-based `INSERT … SELECT` statements (reminders) or bounded batches (outbox claims, retention).

## HTTP smoke (`scripts/perf-smoke.mjs`)

400 authenticated requests per endpoint, concurrency 20, admin of the large organization, 0 errors:

| Endpoint                                          | Req/s | p50 ms | p95 ms | p99 ms |
| ------------------------------------------------- | ----: | -----: | -----: | -----: |
| `/api/v1/health/ready`                            |  2346 |    6.4 |   17.5 |   47.9 |
| `/api/v1/auth/session`                            |  1100 |   16.7 |   25.7 |   38.4 |
| `/api/v1/leads?limit=20`                          |   487 |   39.7 |   55.1 |   66.6 |
| `/api/v1/leads?limit=20&status=Qualified&page=50` |   432 |   45.1 |   59.1 |   66.8 |
| `/api/v1/tasks?limit=20`                          |   874 |   22.4 |   26.2 |   29.3 |
| `/api/v1/notifications?limit=20`                  |  1053 |   18.6 |   22.0 |   24.1 |
| `/api/v1/reports/dashboard-summary`               |   118 |  161.6 |  234.4 |  265.9 |

Every authenticated request pays one session lookup (session, membership, grants, time zone) — the cost visible in `/auth/session`. The dashboard summary aggregates the whole organization on each call; it is the first candidate for caching if dashboards become hot.

## Limits and payloads

- JSON bodies: `BODY_LIMIT` (1 MB); uploads 10 MB (multer), Plivo webhooks 100 KB.
- Page size: every paginated endpoint accepts `limit` 1–100 and rejects anything else with 400 (registry-wide test in `apps/api/test/authorization-matrix.test.ts`).
- Bulk messaging: ≤ 500 leads per request.
- Responses: `Cache-Control: no-store` on every `/api/v1` response; compression is delegated to the load balancer.

## Reproduce

```bash
PERF_DATABASE_URL=postgresql://…/crm_perf node packages/database/scripts/perf-explain.mjs --seed   # seed + plans
PERF_DATABASE_URL=postgresql://…/crm_perf node packages/database/scripts/perf-explain.mjs          # plans only
API_URL=http://127.0.0.1:5000 SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/perf-smoke.mjs --requests 400 --concurrency 20
```
