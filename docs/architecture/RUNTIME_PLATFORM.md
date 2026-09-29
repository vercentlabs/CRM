# Runtime platform (Phase 6)

One API, one worker, one PostgreSQL (the source of truth) and Redis (supporting infrastructure only: queues, never business state).

```
API request ─► service ─► PostgreSQL transaction: domain change + outbox_events row
                                                   │
worker: outbox relay (SKIP LOCKED lease) ◄─────────┘
   └─► BullMQ queue (communications | notifications | webhooks | maintenance)
          └─► processor ─► provider (SMTP, Plivo SMS, ImageKit, HTTPS webhook) / notifications
```

## Outbox and events

- **Events** (`packages/events`): a typed, versioned catalog with Zod payload schemas of identifiers and small facts: `lead.created`, `lead.assigned`, `lead.status_changed`, `customer.created`, `opportunity.stage_changed`, `task.assigned`, `task.completed`, `followup.scheduled`, `message.requested`, `member.invited`, `file.deleted`, and the platform event `auth.password_reset_requested` (no organization). A breaking payload change adds a new version.
- **Writing:** services call `emit(tx, actor, type, id, payload)` (`apps/api/src/platform/events.ts`) with the **transaction client** of the change, so the outbox row commits or rolls back with it. The organization and actor come from the session. `apps/api/test/architecture.test.ts` blocks `emit(pool, …)` and any other direct outbox writes.
- **`outbox_events`:** id (uuid), organization_id (NULL only for platform events), type, version, aggregate, actor, payload, dedupe_key, available_at, claimed_at/by, processed_at, failed_at, attempts, last_error. A partial index covers pending rows.
- **Relay:** claims due events in one `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)` statement. A claim is a lease (`OUTBOX_LEASE_SECONDS`), so a crashed worker's events become claimable again, and only the current claimant can settle an event.
  - If enqueueing fails (Redis down), the event is released with exponential backoff.
  - After `OUTBOX_MAX_ATTEMPTS`, the event is marked dead (`failed_at`, kept for inspection) so it never blocks newer events.
  - Processed events are pruned after `OUTBOX_RETENTION_DAYS`.

## Queues and jobs

| Queue          | Jobs                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| communications | `message.send`, `email.password_reset`, `email.member_invitation`                         |
| notifications  | `notification.event`                                                                      |
| webhooks       | `webhook.fanout`, `webhook.deliver`                                                       |
| maintenance    | `file.delete_object`, recurring `reminders.scan` (1 min) and `maintenance.sweep` (15 min) |

- **Payloads** are strict Zod objects of ids only (`apps/worker/src/jobs/definitions.ts`). They are parsed, never evaluated, and an invalid payload fails permanently. Every tenant job carries `organizationId`, and every worker query binds it (the worker architecture test enforces both). Message bodies, recipient addresses, tokens and secrets never enter Redis.
- **Drivers:**
  - `bullmq` whenever `REDIS_URL` is set; production requires it.
  - `inline` in development and tests only: in-process, same dedupe/retry semantics, lost on restart.
  - Producers fail fast: `enqueue` is bounded to 5 s and rejects when Redis is unavailable, so an event is never marked dispatched without a stored job.
- **Retries:** exponential backoff with 50% jitter, with per-job attempts (5–10).
  - `PermanentJobError`, or a `ProviderError` with `permanent: true` (validation, 4xx), skips the remaining attempts.
  - On the final attempt, processors settle a terminal state (Failed) instead of leaving work pending.
- **Failure visibility:**
  - BullMQ keeps completed jobs 24 h and failed jobs 7 days (bounded counts); inspect them with `pnpm queue:check`.
  - Communications and webhooks also keep durable delivery records (`messages`, `email_deliveries`, `webhook_deliveries`).
  - Logs are JSON lines with job id, name, organization, entity ids, attempt, duration, result and a safe error code.
- **Worker process** (`apps/worker`):
  - It runs the outbox relay, the queue consumers and the schedules.
  - `WORKER_HEALTH_PORT` optionally exposes `/health/live` and `/health/ready` (DB + Redis); there is no business API.
  - On SIGTERM it stops claiming events, lets active jobs finish (bounded by `WORKER_SHUTDOWN_TIMEOUT_MS`), then closes Redis and the database.

## Idempotency

| Work                      | Mechanism                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event dispatch            | Deterministic job ids (`<eventId>.<job>`): BullMQ ignores a duplicate id while the job is retained                                                                                    |
| Lead message (SMS)        | Row lock plus a state machine: only `Queued` is sent. A message found in `Sending` (the previous attempt died mid-call) fails as `DELIVERY_UNKNOWN` rather than risk a duplicate send |
| Email                     | `email_deliveries.dedupe_key` (one row per reset request / invitation); `sent` is terminal                                                                                            |
| Notifications / reminders | `UNIQUE (organization_id, user_id, dedupe_key)`: the event id, or `followup.due.<lead>.<due epoch>`                                                                                   |
| Webhooks                  | `UNIQUE (endpoint_id, event_id)` delivery row; terminal states are never re-sent                                                                                                      |
| Provider file deletion    | `provider_deleted_at`; a missing object counts as deleted                                                                                                                             |
| Usage counters            | Updated in the same transaction as the state transition they measure                                                                                                                  |

## Communications

- **Lead messages** go `Queued` → `Sending` → `Sent` → `Delivered`, or → `Failed`, with a safe `failure_code`.
  - The API only queues. The worker calls the provider, and a Sent status means the provider accepted the message.
  - Only SMS through Plivo is implemented (`SMS_PROVIDER=plivo`). WhatsApp and unconfigured SMS fail truthfully (`CHANNEL_NOT_SUPPORTED`, `PROVIDER_NOT_CONFIGURED`).
  - Plivo delivery reports arrive at the signed `/api/plivo/webhook/message-status`: a fast update keyed by `(provider, provider_message_id)` that only moves forward, so duplicates and late reports are harmless.
- **Password reset:** the API records a pending reset and the platform event. The worker generates the token right before sending and stores only its hash; the raw token exists only in worker memory and in the email. A failed send clears the hash.
- **Invitations:** existing identities invited to an organization get one email per invitation.
- Every provider call has a bounded timeout. There is no circuit breaker; timeouts, retries and visibility are enough at this scale.

## Notifications and reminders

- **Table:** `notifications (organization_id, user_id, …, read_at)`, created only for active members of that organization.
- **Event-driven:** `lead.assigned`, `task.assigned` and `opportunity.stage_changed` notify the assignee or owner, never the actor.
- **Reminders:** `reminders.scan` inserts `followup.due` (next call within 15 min), `followup.overdue` (up to 7 days back) and `task.due` (within 60 min) with idempotent `INSERT … SELECT … ON CONFLICT DO NOTHING`, using partial indexes. The dedupe key includes the due time: one reminder per due time, and a new one after rescheduling.
- **API:** `GET /notifications` (`?unread=true`), `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`. These are always the caller's own notifications in the active organization. Web (topbar bell) and mobile (screen, drawer badge, Home bell) poll every 30 s. There is no push or WebSocket yet.

## Files

- **Metadata:** `files` records every new upload (public id, organization, uploader, provider id, generated storage key, sanitized display name, MIME type, bytes, status and entity).
- **Upload checks:** the declared MIME type must match the content's magic bytes, 10 MB max, and the allowlist applies.
- **Lifecycle:**
  - Uploads start as `uploaded` and expire after 24 h if never attached (`maintenance.sweep`).
  - Chat messages attach a file by `file_id`; the server takes the URL and type from the file record, and only the uploader can attach it, once.
  - `DELETE /files/:id` (uploader or organization manager) marks the metadata deleted, releases storage usage, detaches the chat message and emits `file.deleted`. The worker then removes the provider object, with retries.
  - Historical chat attachment URLs (before Phase 6) are left untouched.
- **Access (Phase 7):** reads never expose the stored URL of a tracked file. Chat message reads return a short-lived signed `attachment_url` (`FileStorage.signedUrl`, `FILE_URL_TTL_SECONDS`), and `GET /files/:id/url` issues a fresh one to the uploader or a participant of the conversation (everything else: identical 404). Provider-side enforcement needs ImageKit "Restrict unsigned URLs" (operator action).
- **Storage** sits behind `FileStorage` (`@crm/integrations`): ImageKit, plus in-memory for development and tests. An S3-compatible adapter would implement the same interface.

## Outbound webhooks

- **Tables:** `webhook_endpoints` (per organization, subscribed event types, AES-256-GCM encrypted secret under `WEBHOOK_SECRET_KEY`) and `webhook_deliveries` (one per endpoint + event).
- **Delivery:**
  - The body is the event envelope, with the organization's public id.
  - Headers carry `x-crm-signature: v1=HMAC-SHA256(secret, "<timestamp>.<body>")`, `x-crm-timestamp`, `x-crm-delivery-id`, `x-crm-event-id` and `x-crm-event-type`.
  - Targets must be HTTPS and resolve to public addresses only (SSRF guard, re-checked on every attempt); redirects are not followed and requests time out after 10 s.
  - 5xx and network errors retry with backoff; other 4xx fail permanently; a disabled endpoint cancels its deliveries.
- **Management (Phase 7):** `/api/v1/webhooks` (list, event types, create, update URL/events/description/active, rotate secret, delete) behind `settings.integrations.manage` (Admin, custom roles; migration 0008) and the sensitive rate limit. Secrets are generated server-side (`whsec_…`), returned only by create/rotate, encrypted with the API's `WEBHOOK_SECRET_KEY` (must equal the worker's), and never logged or audited. URL and event allow-list are validated on write; at most 10 endpoints per organization. Web UI: Settings → Webhooks.

## Operations (Phase 7)

- **Observability:** JSON logs with redaction, Prometheus `/metrics` on `WORKER_HEALTH_PORT` (bearer `METRICS_TOKEN`): outbox pending/dead/oldest, queue counts, job duration/retries/failures by `job_name`, DB pool. Readiness requires the database, the durable queue in production, a running relay and no draining.
- **Retention** (`maintenance.sweep`, `db/retention.ts`): sessions expired/revoked beyond `SESSION_RETENTION_DAYS`, expired refresh tokens, used/expired reset requests, read notifications, finished email/webhook deliveries and metadata of provider-deleted files — in bounded batches. CRM business records are never deleted.
- **Interrupted sends:** a message in `Sending` inside its 60 s lease belongs to a live attempt (a concurrent duplicate job skips it); older ones are settled by the sweep as `Failed / DELIVERY_UNKNOWN`, never resent.
- **Redis data loss:** `packages/database/scripts/outbox-replay.mjs --since <time> --apply` re-dispatches events whose jobs were lost; processors are idempotent.
- **Reminder copy** includes the due time in the organization's time zone (validated against `pg_timezone_names`, UTC fallback).

## Plans, entitlements and usage

- **Tables:** `plans` / `plan_entitlements` (feature flags and numeric limits, NULL = unlimited), `subscriptions` (one per organization; `external_*` columns reserved for a future billing provider and never exposed), `usage_counters`. There are no prices and no payment provider.
- **Keys** (`@crm/entitlements`): features `reports.export`, `messages.bulk`, `files.upload`; limits `seats`, `storage.bytes`. Code never compares plan names.
- **Default plan:** the seeded `base` plan enables everything with no limits. Every existing organization got an active `base` subscription, and new organizations get one through a trigger, so nothing was locked out.
- **Lapsed subscriptions:** a subscription that isn't active or trialing falls back to the default plan until a product decision says otherwise.
- **Resolution:** entitlements are resolved server-side (30 s cache) and never put in tokens. Permission ("may this member?") and entitlement ("has the organization enabled it?") are separate checks, and both can apply.
- **Seats:** active memberships count; invited and suspended ones don't. Member creation, reactivation and invitation acceptance check the limit under the organization row lock in the activating transaction, which makes concurrent requests race-safe. Errors are `PLAN_LIMIT_REACHED` (409) and `FEATURE_NOT_ENABLED` (403).
- **Plan state for clients:** `GET /organization/entitlements` returns the plan, features, limits and current usage (seats, stored bytes).
- **Usage metered:** active seats (live count), `storage.bytes` (lifetime, on upload and delete), `messages.sent` (monthly, when the provider accepts a message).

## Exports

The lead CSV export stays synchronous (bounded by the organization's leads) and is gated by `reports.export`. A future large export would become a `maintenance`/exports job producing a `files` record; none is needed today.

## Local development

- `pnpm dev:infra` starts PostgreSQL and Redis (`infrastructure/docker/docker-compose.dev.yml`).
- `pnpm worker:dev` / `pnpm worker:start` run the worker, and `pnpm queue:check` shows outbox and queue status.
- Tests use `TEST_DATABASE_URL` (disposable Postgres) and `REDIS_TEST_URL` (disposable Redis); without them the integration suites are skipped.
