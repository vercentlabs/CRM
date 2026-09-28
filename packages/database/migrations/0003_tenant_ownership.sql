-- Phase 2: tenant ownership of every business table.
--
-- Ownership classification (baseline tables):
--   Global platform/identity : users, roles (built-in), permissions, password_resets
--   Organization-owned (direct organization_id):
--       leads, followups, calls, messages, notes, tasks, customers, opportunities,
--       sales_locations, user_locations, settings, audit_logs, chat_conversations
--   Derived through a tenant-owned parent:
--       chat_participants, chat_messages  -> chat_conversations.organization_id
--
-- Existing single-company installations: every existing row is assigned to one
-- deterministic legacy organization (public_id 00000000-0000-4000-8000-000000000001,
-- slug 'default'), every existing user becomes a member with the role that
-- matches users.role_id. Empty databases get no organization; create one with
-- `pnpm org:bootstrap`. The whole file runs in one transaction.
--
-- Reviewed destructive statement: the only DELETE removes the baseline's
-- ownerless default `settings` rows on a database that has no other data
-- (fresh install); installations with data keep every row.
-- crm:allow-destructive

-- ---------------------------------------------------------------------------
-- 1. Add nullable tenant columns
-- ---------------------------------------------------------------------------
ALTER TABLE leads              ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE followups          ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE calls              ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE messages           ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE notes              ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE tasks              ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE customers          ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE opportunities      ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE sales_locations    ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE user_locations     ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE settings           ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE chat_conversations ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
-- Audit rows may be platform-level (e.g. failed login for an unknown org); stays nullable.
ALTER TABLE audit_logs         ADD COLUMN organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE audit_logs         ADD COLUMN request_id VARCHAR(128);

-- Schema drift: chat.controller.js writes file_type, missing from the baseline snapshot.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_type VARCHAR(100);

-- ---------------------------------------------------------------------------
-- 2. Legacy backfill into one deterministic organization
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    legacy_org_id INTEGER;
    has_data BOOLEAN;
    org_name TEXT;
BEGIN
    SELECT EXISTS (SELECT 1 FROM users)
        OR EXISTS (SELECT 1 FROM leads)
        OR EXISTS (SELECT 1 FROM customers)
        OR EXISTS (SELECT 1 FROM tasks)
        OR EXISTS (SELECT 1 FROM notes)
        OR EXISTS (SELECT 1 FROM sales_locations)
        OR EXISTS (SELECT 1 FROM chat_conversations)
        OR EXISTS (SELECT 1 FROM audit_logs)
    INTO has_data;

    IF NOT has_data THEN
        -- Fresh install: settings rows seeded by the baseline have no owner yet.
        DELETE FROM settings WHERE organization_id IS NULL;
        RETURN;
    END IF;

    SELECT NULLIF(btrim(value, '" '), '') INTO org_name FROM settings WHERE key = 'site_name' LIMIT 1;

    INSERT INTO organizations (public_id, name, slug)
    VALUES ('00000000-0000-4000-8000-000000000001', COALESCE(org_name, 'Default Organization'), 'default')
    ON CONFLICT (public_id) DO NOTHING;

    SELECT id INTO legacy_org_id FROM organizations
    WHERE public_id = '00000000-0000-4000-8000-000000000001';

    INSERT INTO organization_memberships (organization_id, user_id, role_id, status, joined_at)
    SELECT legacy_org_id,
           u.id,
           r.id,
           CASE WHEN COALESCE(u.is_active, true) THEN 'active' ELSE 'suspended' END,
           u.created_at
    FROM users u
    JOIN roles r ON r.legacy_role_id = u.role_id AND r.organization_id IS NULL
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    UPDATE leads              SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE followups          SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE calls              SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE messages           SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE notes              SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE tasks              SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE customers          SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE opportunities      SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE sales_locations    SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE user_locations     SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE settings           SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE chat_conversations SET organization_id = legacy_org_id WHERE organization_id IS NULL;
    UPDATE audit_logs         SET organization_id = legacy_org_id WHERE organization_id IS NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Validate before enforcing NOT NULL (fails the whole migration otherwise)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
    missing BIGINT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['leads', 'followups', 'calls', 'messages', 'notes', 'tasks',
                               'customers', 'opportunities', 'sales_locations', 'user_locations',
                               'settings', 'chat_conversations']
    LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE organization_id IS NULL', tbl) INTO missing;
        IF missing > 0 THEN
            RAISE EXCEPTION 'tenant backfill incomplete: % rows in % have no organization_id', missing, tbl;
        END IF;
    END LOOP;
END $$;

ALTER TABLE leads              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE followups          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE calls              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE messages           ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE notes              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE tasks              ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customers          ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE opportunities      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE sales_locations    ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE user_locations     ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE settings           ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE chat_conversations ALTER COLUMN organization_id SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Global uniqueness -> organization-scoped uniqueness
--    (constraint names may differ on pgAdmin-managed databases, so drop by columns)
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.drop_unique_on(tbl regclass, cols text[]) RETURNS void AS $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = tbl
          AND con.contype = 'u'
          AND (SELECT array_agg(att.attname::text ORDER BY att.attname)
               FROM unnest(con.conkey) AS k(attnum)
               JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum)
              = (SELECT array_agg(x ORDER BY x) FROM unnest(cols) AS x)
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl, c.conname);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Two organizations may each have a customer with the same email.
SELECT pg_temp.drop_unique_on('customers', ARRAY['email']);
ALTER TABLE customers ADD CONSTRAINT customers_org_email_key UNIQUE (organization_id, email);

-- Each organization has its own settings namespace.
SELECT pg_temp.drop_unique_on('settings', ARRAY['key']);
ALTER TABLE settings ADD CONSTRAINT settings_org_key_key UNIQUE (organization_id, key);

-- A user who belongs to two organizations reports a location to each separately.
SELECT pg_temp.drop_unique_on('user_locations', ARRAY['user_id']);
ALTER TABLE user_locations ADD CONSTRAINT user_locations_org_user_key UNIQUE (organization_id, user_id);

-- ---------------------------------------------------------------------------
-- 5. Tenant-consistent parent references (child rows must share the lead's org)
-- ---------------------------------------------------------------------------
ALTER TABLE leads ADD CONSTRAINT leads_org_id_key UNIQUE (organization_id, id);

ALTER TABLE followups ADD CONSTRAINT followups_org_lead_fkey
    FOREIGN KEY (organization_id, lead_id) REFERENCES leads (organization_id, id);
ALTER TABLE calls ADD CONSTRAINT calls_org_lead_fkey
    FOREIGN KEY (organization_id, lead_id) REFERENCES leads (organization_id, id);
ALTER TABLE messages ADD CONSTRAINT messages_org_lead_fkey
    FOREIGN KEY (organization_id, lead_id) REFERENCES leads (organization_id, id);
ALTER TABLE opportunities ADD CONSTRAINT opportunities_org_lead_fkey
    FOREIGN KEY (organization_id, lead_id) REFERENCES leads (organization_id, id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Tenant indexes (leading with organization_id)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_leads_org_created ON leads (organization_id, created_at DESC);
CREATE INDEX idx_leads_org_assigned ON leads (organization_id, assigned_to);
CREATE INDEX idx_followups_org_date ON followups (organization_id, followup_date);
CREATE INDEX idx_calls_org_start ON calls (organization_id, start_time DESC);
CREATE INDEX idx_messages_org_sent ON messages (organization_id, sent_at DESC);
CREATE INDEX idx_notes_org_updated ON notes (organization_id, updated_at DESC);
CREATE INDEX idx_tasks_org_due ON tasks (organization_id, due_date);
CREATE INDEX idx_customers_org_created ON customers (organization_id, created_at DESC);
CREATE INDEX idx_opportunities_org_created ON opportunities (organization_id, created_at DESC);
CREATE INDEX idx_sales_locations_org ON sales_locations (organization_id, name);
CREATE INDEX idx_chat_conversations_org ON chat_conversations (organization_id, updated_at DESC);
CREATE INDEX idx_audit_logs_org_created ON audit_logs (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Remove unused database objects that aggregate across all tenants
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS lead_summary;
DROP VIEW IF EXISTS followup_summary;
DROP VIEW IF EXISTS user_performance;
DROP FUNCTION IF EXISTS get_upcoming_followups(INTEGER);
DROP FUNCTION IF EXISTS get_conversion_rate(DATE, DATE);
DROP PROCEDURE IF EXISTS assign_leads_to_sales(INTEGER, INTEGER);

-- legacy/add-notes-trigger.sql (manual pgAdmin script) reassigned notes to the
-- globally first active user, which would move data across tenants.
DROP TRIGGER IF EXISTS validate_note_author_trigger ON notes;
DROP FUNCTION IF EXISTS validate_note_author();
DROP FUNCTION IF EXISTS get_first_active_user_id();
