-- Phase 6: transactional outbox, in-app notifications and truthful
-- communication delivery state.
--
--   outbox_events     domain events written in the SAME transaction as the
--                     business change; the worker claims them with
--                     FOR UPDATE SKIP LOCKED leases and fans them out to jobs.
--   notifications     per-user, per-organization in-app notifications.
--                     (organization_id, user_id, dedupe_key) is unique, which
--                     makes event- and reminder-driven creation idempotent.
--   messages          lead messages get a delivery lifecycle
--                     (Queued → Sending → Sent → Delivered | Failed) instead of
--                     being stored as 'Sent' without any provider call.
--   email_deliveries  one row per logical email (unique dedupe_key) so replays
--                     never send twice after a confirmed send.
--   password_resets   the worker now generates the reset token right before
--                     sending it, so no raw token is ever stored, queued or
--                     written to the outbox; token_hash is NULL until then.
--
-- Only constraints are dropped and re-created (messages_status_check, NOT
-- NULL on password_resets.token_hash); no data is removed.

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
CREATE TABLE outbox_events (
    id              UUID PRIMARY KEY,
    -- NULL only for platform events (e.g. password reset of a global identity).
    organization_id INTEGER REFERENCES organizations(id),
    event_type      VARCHAR(100) NOT NULL,
    event_version   SMALLINT     NOT NULL DEFAULT 1 CHECK (event_version > 0),
    aggregate_type  VARCHAR(50)  NOT NULL,
    aggregate_id    VARCHAR(64)  NOT NULL,
    actor_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    dedupe_key      VARCHAR(200),
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    available_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    claimed_at      TIMESTAMPTZ,
    claimed_by      VARCHAR(100),
    processed_at    TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    attempts        INTEGER      NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error      VARCHAR(500),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX outbox_events_dedupe_key ON outbox_events (dedupe_key)
    WHERE dedupe_key IS NOT NULL;
-- Relay scan: pending (neither processed nor dead) events by availability.
CREATE INDEX idx_outbox_events_pending ON outbox_events (available_at)
    WHERE processed_at IS NULL AND failed_at IS NULL;
CREATE INDEX idx_outbox_events_org_occurred ON outbox_events (organization_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    public_id       UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    organization_id INTEGER      NOT NULL REFERENCES organizations(id),
    user_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50)  NOT NULL,
    title           VARCHAR(200) NOT NULL,
    body            VARCHAR(500),
    entity_type     VARCHAR(30) CHECK (entity_type IN ('lead', 'task', 'opportunity')),
    entity_id       INTEGER,
    dedupe_key      VARCHAR(200) NOT NULL,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT notifications_dedupe UNIQUE (organization_id, user_id, dedupe_key),
    CONSTRAINT notifications_entity_pair CHECK ((entity_type IS NULL) = (entity_id IS NULL))
);

CREATE INDEX idx_notifications_user_recent ON notifications (organization_id, user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications (organization_id, user_id)
    WHERE read_at IS NULL;

-- Reminder scans (worker, every minute): upcoming/overdue follow-ups and open tasks.
CREATE INDEX idx_leads_next_call_assigned ON leads (next_call_at)
    WHERE next_call_at IS NOT NULL AND assigned_to IS NOT NULL;
CREATE INDEX idx_tasks_open_due ON tasks (due_date)
    WHERE assigned_to IS NOT NULL AND status IN ('pending', 'in_progress');

-- ---------------------------------------------------------------------------
-- Lead message delivery lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE messages DROP CONSTRAINT messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check
    CHECK (status IN ('Queued', 'Sending', 'Sent', 'Delivered', 'Failed'));
ALTER TABLE messages ALTER COLUMN status SET DEFAULT 'Queued';
ALTER TABLE messages ALTER COLUMN status SET NOT NULL;
-- sent_at now means "accepted by the provider"; queued messages have none.
ALTER TABLE messages ALTER COLUMN sent_at DROP DEFAULT;

ALTER TABLE messages
    ADD COLUMN provider            VARCHAR(20),
    ADD COLUMN provider_message_id VARCHAR(100),
    ADD COLUMN queued_at           TIMESTAMPTZ,
    ADD COLUMN sending_started_at  TIMESTAMPTZ,
    ADD COLUMN delivered_at        TIMESTAMPTZ,
    ADD COLUMN failed_at           TIMESTAMPTZ,
    ADD COLUMN failure_code        VARCHAR(50),
    ADD COLUMN failure_message     VARCHAR(300),
    ADD COLUMN attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0);

-- Provider callbacks look messages up by their provider id.
CREATE UNIQUE INDEX messages_provider_message_key ON messages (provider, provider_message_id)
    WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_messages_org_status ON messages (organization_id, status);
CREATE INDEX idx_messages_org_created ON messages (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Email delivery records
-- ---------------------------------------------------------------------------
CREATE TABLE email_deliveries (
    id                  SERIAL PRIMARY KEY,
    -- NULL for platform emails (password reset of a global identity).
    organization_id     INTEGER REFERENCES organizations(id),
    kind                VARCHAR(40)  NOT NULL CHECK (kind IN ('password_reset', 'member_invitation')),
    dedupe_key          VARCHAR(200) NOT NULL UNIQUE,
    recipient_user_id   INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts            INTEGER      NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    provider_message_id VARCHAR(255),
    failure_code        VARCHAR(50),
    sent_at             TIMESTAMPTZ,
    failed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_deliveries_org_created ON email_deliveries (organization_id, created_at DESC);
CREATE INDEX idx_email_deliveries_status ON email_deliveries (status) WHERE status IN ('pending', 'sending');

-- ---------------------------------------------------------------------------
-- Password reset: the worker creates the token at delivery time
-- ---------------------------------------------------------------------------
ALTER TABLE password_resets ALTER COLUMN token_hash DROP NOT NULL;
ALTER TABLE password_resets ADD COLUMN email_sent_at TIMESTAMPTZ;
