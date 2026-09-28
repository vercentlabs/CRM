-- Phase 6: file metadata/lifecycle and the outbound webhook foundation.
--
--   files               metadata for every NEW upload (binary content stays in
--                       the storage provider). Upload → 'uploaded' (expires if
--                       never attached) → 'attached' to a CRM entity →
--                       'deleted' (metadata first; the worker then removes the
--                       provider object and stamps provider_deleted_at).
--                       Historical chat attachment URLs are left untouched.
--   webhook_endpoints   per-organization HTTPS endpoints subscribed to public
--                       event types. The signing secret is stored encrypted
--                       (AES-256-GCM, WEBHOOK_SECRET_KEY) because HMAC signing
--                       needs the secret itself; it is never logged or returned.
--   webhook_deliveries  one row per (endpoint, event): the idempotency record
--                       for outbound delivery, with attempts and outcome.

CREATE TABLE files (
    id                  SERIAL PRIMARY KEY,
    public_id           UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    organization_id     INTEGER      NOT NULL REFERENCES organizations(id),
    uploaded_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provider            VARCHAR(20)  NOT NULL CHECK (provider IN ('imagekit', 'memory')),
    provider_file_id    VARCHAR(255) NOT NULL,
    storage_key         VARCHAR(500) NOT NULL,
    url                 TEXT         NOT NULL,
    filename            VARCHAR(255) NOT NULL,
    mime_type           VARCHAR(150) NOT NULL,
    size_bytes          BIGINT       NOT NULL CHECK (size_bytes >= 0),
    purpose             VARCHAR(30)  NOT NULL CHECK (purpose IN ('chat_attachment')),
    entity_type         VARCHAR(30) CHECK (entity_type IN ('chat_message')),
    entity_id           INTEGER,
    status              VARCHAR(20)  NOT NULL DEFAULT 'uploaded'
                        CHECK (status IN ('uploaded', 'attached', 'deleted')),
    expires_at          TIMESTAMPTZ,
    attached_at         TIMESTAMPTZ,
    deleted_at          TIMESTAMPTZ,
    provider_deleted_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT files_entity_pair CHECK ((entity_type IS NULL) = (entity_id IS NULL)),
    CONSTRAINT files_deleted_state CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);

CREATE INDEX idx_files_org_created ON files (organization_id, created_at DESC);
CREATE INDEX idx_files_org_entity ON files (organization_id, entity_type, entity_id)
    WHERE entity_type IS NOT NULL;
-- Maintenance scans: expired unattached uploads, and provider objects still to delete.
CREATE INDEX idx_files_expiring ON files (expires_at) WHERE status = 'uploaded';
CREATE INDEX idx_files_provider_pending ON files (deleted_at)
    WHERE status = 'deleted' AND provider_deleted_at IS NULL;

CREATE TABLE webhook_endpoints (
    id                SERIAL PRIMARY KEY,
    public_id         UUID          NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    organization_id   INTEGER       NOT NULL REFERENCES organizations(id),
    url               VARCHAR(2000) NOT NULL,
    description       VARCHAR(200),
    event_types       TEXT[]        NOT NULL CHECK (cardinality(event_types) > 0),
    secret_ciphertext TEXT          NOT NULL,
    active            BOOLEAN       NOT NULL DEFAULT true,
    created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_endpoints_org_active ON webhook_endpoints (organization_id) WHERE active;

CREATE TABLE webhook_deliveries (
    id              SERIAL PRIMARY KEY,
    public_id       UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    organization_id INTEGER      NOT NULL REFERENCES organizations(id),
    endpoint_id     INTEGER      NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    -- Outbox event id (no FK so processed events can be pruned independently).
    event_id        UUID         NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'delivering', 'delivered', 'failed', 'cancelled')),
    attempts        INTEGER      NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    response_status INTEGER,
    last_error      VARCHAR(300),
    delivered_at    TIMESTAMPTZ,
    failed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT webhook_deliveries_endpoint_event UNIQUE (endpoint_id, event_id)
);

CREATE INDEX idx_webhook_deliveries_org_created ON webhook_deliveries (organization_id, created_at DESC);
