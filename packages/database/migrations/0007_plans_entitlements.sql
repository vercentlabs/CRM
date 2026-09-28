-- Phase 6: provider-agnostic plans, entitlements, subscriptions and usage.
--
--   plans / plan_entitlements  technical entitlements per plan: feature flags
--                              (enabled) and numeric limits (limit_value, NULL =
--                              unlimited). Keys are defined in @crm/entitlements.
--                              No prices or payment-provider data live here.
--   subscriptions              exactly one per organization (the current one).
--                              external_* columns are reserved for a future
--                              billing provider and never exposed to clients.
--   usage_counters             atomic per-organization counters (period
--                              'lifetime' or 'YYYY-MM'), updated in the same
--                              transaction as the change they measure.
--
-- Backward compatibility: the seeded default plan 'base' enables every current
-- capability without numeric limits, and every existing organization gets an
-- active 'base' subscription, so nobody is locked out by this migration. New
-- organizations get the default plan through a trigger.

CREATE TABLE plans (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(50)  NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_-]{1,49}$'),
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_default  BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX plans_single_default ON plans (is_default) WHERE is_default;

CREATE TABLE plan_entitlements (
    plan_id     INTEGER     NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    key         VARCHAR(60) NOT NULL,
    enabled     BOOLEAN     NOT NULL DEFAULT true,
    limit_value BIGINT CHECK (limit_value >= 0),
    PRIMARY KEY (plan_id, key)
);

CREATE TABLE subscriptions (
    id                   SERIAL PRIMARY KEY,
    organization_id      INTEGER     NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id              INTEGER     NOT NULL REFERENCES plans(id),
    status               VARCHAR(20) NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    external_provider    VARCHAR(30),
    external_reference   VARCHAR(100),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_plan ON subscriptions (plan_id);

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE usage_counters (
    organization_id INTEGER     NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    metric          VARCHAR(50) NOT NULL,
    period          VARCHAR(10) NOT NULL CHECK (period = 'lifetime' OR period ~ '^\d{4}-\d{2}$'),
    value           BIGINT      NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, metric, period)
);

-- Default plan: every capability the product has today, no numeric limits.
INSERT INTO plans (key, name, description, is_default)
VALUES ('base', 'Base', 'Default plan: all current CRM capabilities, no numeric limits.', true);

INSERT INTO plan_entitlements (plan_id, key, enabled, limit_value)
SELECT p.id, e.key, true, NULL
FROM plans p
CROSS JOIN (VALUES ('reports.export'), ('messages.bulk'), ('files.upload'),
                   ('seats'), ('storage.bytes')) AS e(key)
WHERE p.key = 'base';

INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start)
SELECT o.id, p.id, 'active', now()
FROM organizations o
CROSS JOIN plans p
WHERE p.is_default
ON CONFLICT (organization_id) DO NOTHING;

-- Every new organization starts on the default plan.
CREATE OR REPLACE FUNCTION assign_default_subscription() RETURNS trigger AS $$
BEGIN
    INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start)
    SELECT NEW.id, p.id, 'active', now() FROM plans p WHERE p.is_default
    ON CONFLICT (organization_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_default_subscription
    AFTER INSERT ON organizations
    FOR EACH ROW EXECUTE FUNCTION assign_default_subscription();
