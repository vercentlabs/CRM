# Monitoring

Logs, metrics, alerts and error reporting come from `@crm/observability`, shared by the API and the worker.

## Logs

- One JSON object per line on stdout (info/debug) and stderr (warn/error): `time`, `level`, `msg`, `service` (`api`/`worker`), `version`, `commit`, plus context: `requestId`, `organizationId`, `userId` (API, from the verified session), `route` (Express template, e.g. `/api/v1/leads/:id`), `method`, `status`, `durationMs`, and for jobs `jobId`, `job`, `attempt`, `outcome`, `durationMs`.
- **Redaction is central** (`packages/observability/src/redact.ts`): keys matching password/secret/token/authorization/cookie/api key/signature/credential/session id/otp/ciphertext are replaced with `[REDACTED]` at any depth, and values that look like bearer/basic credentials, URLs with passwords or token/signature query parameters, JWTs or `whsec_` secrets are masked inside strings. Message bodies, phone numbers and email recipients are never logged by processors. Tests: `packages/observability/src/index.test.ts`, API/worker "never logs" tests.
- Access log: every request logs `http_request` (info); `/health/*` and `/metrics` log at debug; requests slower than `SLOW_REQUEST_MS` (1 s) log `http_request_slow` (warn); 500s log at error.
- Error classification: unexpected failures (`INTERNAL_ERROR`, non-`AppError`) → `request_failed` at **error** with a stack and an `error_captured` report; deliberate dependency outages (`AppError` 503, e.g. an unconfigured optional integration or Redis down) → **warn** without a stack. 4xx → warn.
- Ship stdout/stderr with the platform's log drain to a log store with ≥ 30 days retention and access control (logs contain organization/user ids and IPs).

## Error reporting

`captureError()` is provider-neutral. Default: `logErrorReporter` writes an `error_captured` log line (with request id, route, organization and user ids, redacted). To use Sentry or similar later, call `setErrorReporter()` with an adapter at startup — no code elsewhere changes.

## Metrics

Prometheus text format, protected by a bearer token (`METRICS_TOKEN`; unset = endpoint disabled/404; wrong token = 401):

| Process | Endpoint                                      | Notes                                                                                 |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| API     | `GET /metrics` on the API port                | block `/metrics` at the public load balancer as well; scrape over the private network |
| Worker  | `GET /metrics` on `WORKER_HEALTH_PORT` (8081) | private network only                                                                  |

```yaml
# prometheus.yml (excerpt)
scrape_configs:
  - job_name: crm-api
    metrics_path: /metrics
    authorization: { type: Bearer, credentials_file: /etc/prometheus/crm-api-token }
    static_configs: [{ targets: ['api-1:5000', 'api-2:5000'] }]
  - job_name: crm-worker
    metrics_path: /metrics
    authorization: { type: Bearer, credentials_file: /etc/prometheus/crm-worker-token }
    static_configs: [{ targets: ['worker-1:8081'] }]
rule_files: [/etc/prometheus/rules/prometheus-alerts.yml]
```

Series (all prefixed `crm_`; default Node process metrics are prefixed `crm_api_` / `crm_worker_`). **No label carries an organization, user or record id.**

| Metric                                                       | Type      | Labels                                                                                                                        |
| ------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `crm_build_info`                                             | gauge (1) | `version`, `commit`, `service`                                                                                                |
| `crm_http_requests_total`                                    | counter   | `method`, `route` (template), `status` (2xx/4xx/5xx)                                                                          |
| `crm_http_request_duration_seconds`                          | histogram | `method`, `route`, `status`                                                                                                   |
| `crm_http_requests_active`                                   | gauge     | —                                                                                                                             |
| `crm_auth_failures_total`                                    | counter   | `reason` (credentials, refresh, token, csrf)                                                                                  |
| `crm_rate_limit_blocks_total`                                | counter   | `policy`                                                                                                                      |
| `crm_rate_limit_store_errors_total`                          | counter   | —                                                                                                                             |
| `crm_db_pool_connections` / `crm_worker_db_pool_connections` | gauge     | `state` (total, idle, waiting)                                                                                                |
| `crm_db_errors_total`                                        | counter   | `kind` (query, pool)                                                                                                          |
| `crm_outbox_events`                                          | gauge     | `state` (pending, dead)                                                                                                       |
| `crm_outbox_oldest_pending_seconds`                          | gauge     | —                                                                                                                             |
| `crm_outbox_dispatch_errors_total`                           | counter   | —                                                                                                                             |
| `crm_queue_jobs`                                             | gauge     | `queue` (communications, notifications, webhooks, maintenance), `state` (waiting, active, delayed, failed)                    |
| `crm_job_duration_seconds`                                   | histogram | `job_name`, `result` (ok, retry, failed)                                                                                      |
| `crm_job_retries_total`, `crm_job_failures_total`            | counter   | `job_name` (terminal failures of `message.send`, `webhook.deliver`, `notification.event`, … are the business failure signals) |

The worker uses `job_name` (not `job`) because Prometheus reserves `job` for the scrape job.

## Alerts

Rules: [`infrastructure/monitoring/prometheus-alerts.yml`](../../infrastructure/monitoring/prometheus-alerts.yml) (validated with `promtool check rules`: 14 rules). `page` = wake someone, `warn` = next business day, `info` = dashboard.

| Alert                        | Severity | Condition                                                    |
| ---------------------------- | -------- | ------------------------------------------------------------ |
| CrmApiDown / CrmWorkerDown   | page     | target not scraped for 2 / 5 min                             |
| CrmApiHigh5xxRate            | page     | > 2 % 5xx for 5 min                                          |
| CrmApiLatencyP95High         | warn     | p95 > 1 s for 10 min (health/metrics excluded)               |
| CrmDbPoolExhausted           | page     | > 5 requests waiting for a connection for 5 min              |
| CrmDbErrors                  | warn     | > 0.5 database errors/s                                      |
| CrmOutboxBacklog             | page     | oldest pending event > 5 min                                 |
| CrmOutboxDeadEvents          | warn     | dead events present for 15 min                               |
| CrmQueueBacklog              | warn     | > 500 waiting jobs in a queue for 10 min                     |
| CrmJobFailures               | warn     | > 5 terminal failures of one job type in 15 min              |
| CrmRemindersStalled          | warn     | no reminder scan in 15 min                                   |
| CrmRateLimitStoreUnavailable | page     | Redis errors in the rate limiter (auth endpoints answer 503) |
| CrmAuthFailureSpike          | warn     | > 5 auth failures/s for 10 min                               |
| CrmRateLimitBlocksSpike      | info     | sustained blocks per policy                                  |

Also alert on the managed services' own metrics: PostgreSQL CPU/storage/connections/replication lag, Redis memory (must stay below `maxmemory` — policy is `noeviction`), certificate expiry, and an external uptime check on `https://<api>/api/v1/health/ready` and the web login page.

## Dashboard specification

One dashboard, "CRM production", template variable `instance`:

1. **Traffic & errors:** request rate by status class; 5xx ratio; top routes by rate; top routes by 5xx.
2. **Latency:** p50/p95/p99 by route (`histogram_quantile` over `crm_http_request_duration_seconds_bucket`); slow-request log count.
3. **Database:** pool total/idle/waiting (API and worker); `crm_db_errors_total` rate.
4. **Security:** auth failures by reason; rate-limit blocks by policy; rate-limit store errors.
5. **Background:** outbox pending/dead and oldest age; queue waiting/active/failed per queue; job rate and p95 duration by `job_name` and result; retries and terminal failures by `job_name`.
6. **Runtime:** process CPU, resident memory, event-loop lag, heap (`crm_api_*`/`crm_worker_*` default metrics); `crm_build_info` (current version per instance — mixed versions visible during a rollout).
