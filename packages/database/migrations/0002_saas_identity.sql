-- Phase 2: SaaS identity model.
-- users = global identities; organization_memberships = a user's access to one
-- organization; roles (built-in templates or organization-owned) grant
-- permissions with a record scope. Server sessions back every access token.
-- Requires PostgreSQL 13+ (gen_random_uuid()).

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
    id          SERIAL PRIMARY KEY,
    public_id   UUID NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(63) NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT organizations_public_id_key UNIQUE (public_id),
    CONSTRAINT organizations_slug_key UNIQUE (slug),
    CONSTRAINT organizations_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT organizations_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Roles: built-in templates (organization_id NULL, is_system) + future
-- organization-owned custom roles. Authorization never reads role ids/keys;
-- it reads role_permissions.
-- ---------------------------------------------------------------------------
ALTER TABLE roles
    ADD COLUMN key VARCHAR(50),
    ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN legacy_role_id SMALLINT,
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Role names were globally unique; custom roles need per-organization names.
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key;

-- Built-in roles keep ids 1/2/3 so existing users.role_id values map exactly.
INSERT INTO roles (id, name, description, key, is_system, legacy_role_id) VALUES
    (1, 'Admin', 'Full access to the organization', 'admin', true, 1),
    (2, 'Manager', 'Organization-wide CRM access and reports', 'manager', true, 2),
    (3, 'Sales', 'Works own leads, customers and opportunities', 'sales', true, 3)
ON CONFLICT (id) DO UPDATE
    SET key = EXCLUDED.key,
        is_system = true,
        legacy_role_id = EXCLUDED.legacy_role_id;

-- Any other pre-existing global role becomes an unassignable legacy template.
UPDATE roles SET key = 'legacy_' || id WHERE key IS NULL;

SELECT setval(pg_get_serial_sequence('roles', 'id'), GREATEST((SELECT MAX(id) FROM roles), 3));

ALTER TABLE roles
    ALTER COLUMN key SET NOT NULL,
    ADD CONSTRAINT roles_key_check CHECK (key ~ '^[a-z][a-z0-9_]*$'),
    ADD CONSTRAINT roles_legacy_role_id_key UNIQUE (legacy_role_id);

CREATE UNIQUE INDEX roles_global_key_uniq ON roles (key) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX roles_org_key_uniq ON roles (organization_id, key) WHERE organization_id IS NOT NULL;
CREATE UNIQUE INDEX roles_global_name_uniq ON roles (name) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX roles_org_name_uniq ON roles (organization_id, name) WHERE organization_id IS NOT NULL;

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Permissions (vocabulary mirrors @crm/permissions; a test enforces it)
-- ---------------------------------------------------------------------------
CREATE TABLE permissions (
    key         VARCHAR(100) PRIMARY KEY,
    description TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT permissions_key_check CHECK (key ~ '^[a-z]+\.[a-z]+\.[a-z]+$')
);

CREATE TABLE role_permissions (
    role_id        INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL REFERENCES permissions(key) ON UPDATE CASCADE ON DELETE CASCADE,
    -- 'team' is reserved until a real teams model exists.
    scope          VARCHAR(20) NOT NULL DEFAULT 'organization',
    PRIMARY KEY (role_id, permission_key),
    CONSTRAINT role_permissions_scope_check CHECK (scope IN ('own', 'organization'))
);

-- ---------------------------------------------------------------------------
-- Memberships: the authoritative user <-> organization relationship.
-- ---------------------------------------------------------------------------
CREATE TABLE organization_memberships (
    id              SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         INTEGER NOT NULL REFERENCES roles(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    invited_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    joined_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT organization_memberships_org_user_key UNIQUE (organization_id, user_id),
    CONSTRAINT organization_memberships_status_check CHECK (status IN ('active', 'invited', 'suspended'))
);

CREATE INDEX idx_organization_memberships_user ON organization_memberships (user_id);

CREATE TRIGGER update_organization_memberships_updated_at BEFORE UPDATE ON organization_memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- A membership may only reference a built-in role or a role of its own organization.
CREATE FUNCTION enforce_membership_role_tenant()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM roles r
        WHERE r.id = NEW.role_id
          AND (r.organization_id = NEW.organization_id OR (r.organization_id IS NULL AND r.is_system))
    ) THEN
        RAISE EXCEPTION 'role % is not assignable in organization %', NEW.role_id, NEW.organization_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organization_memberships_role_tenant
    BEFORE INSERT OR UPDATE OF role_id, organization_id ON organization_memberships
    FOR EACH ROW EXECUTE FUNCTION enforce_membership_role_tenant();

-- ---------------------------------------------------------------------------
-- Users: role_id is DEPRECATED (kept for rollback/compatibility only).
-- ---------------------------------------------------------------------------
ALTER TABLE users ALTER COLUMN role_id DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role_id IS NULL OR role_id IN (1, 2, 3));
-- Login matches emails case-insensitively.
CREATE INDEX idx_users_email_lower ON users (lower(email));

COMMENT ON COLUMN users.role_id IS
    'DEPRECATED (Phase 2): authorization uses organization_memberships.role_id. Not written by new code; drop in Phase 3 after all clients stop reading it.';

-- ---------------------------------------------------------------------------
-- Sessions and rotating refresh tokens (only SHA-256 hashes are stored).
-- ---------------------------------------------------------------------------
CREATE TABLE auth_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client          VARCHAR(20) NOT NULL,
    user_agent      VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  VARCHAR(50),
    CONSTRAINT auth_sessions_client_check CHECK (client IN ('web', 'mobile', 'api'))
);

CREATE INDEX idx_auth_sessions_user_active ON auth_sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    session_id  UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    rotated_at  TIMESTAMPTZ,
    CONSTRAINT auth_refresh_tokens_hash_key UNIQUE (token_hash)
);

CREATE INDEX idx_auth_refresh_tokens_session ON auth_refresh_tokens (session_id);

-- ---------------------------------------------------------------------------
-- Seed: permission vocabulary and built-in role grants (@crm/permissions).
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, description) VALUES
  ('crm.leads.read', 'View leads'),
  ('crm.leads.create', 'Create leads'),
  ('crm.leads.update', 'Edit leads'),
  ('crm.leads.assign', 'Assign leads to other members'),
  ('crm.customers.read', 'View customers'),
  ('crm.customers.create', 'Create customers'),
  ('crm.customers.update', 'Edit customers'),
  ('crm.customers.delete', 'Delete customers'),
  ('crm.opportunities.read', 'View opportunities'),
  ('crm.opportunities.create', 'Create opportunities'),
  ('crm.opportunities.update', 'Edit opportunities'),
  ('crm.opportunities.assign', 'Assign opportunities to other members'),
  ('crm.followups.read', 'View follow-ups'),
  ('crm.followups.create', 'Schedule follow-ups'),
  ('crm.followups.update', 'Complete or update follow-ups'),
  ('crm.tasks.read', 'View tasks and calendar events'),
  ('crm.tasks.create', 'Create tasks and calendar events'),
  ('crm.tasks.update', 'Edit tasks and calendar events'),
  ('crm.tasks.delete', 'Delete tasks and calendar events'),
  ('crm.notes.read', 'View notes'),
  ('crm.notes.create', 'Create notes'),
  ('crm.notes.update', 'Edit notes'),
  ('crm.notes.delete', 'Delete notes'),
  ('crm.calls.read', 'View call logs'),
  ('crm.calls.create', 'Place calls'),
  ('crm.calls.update', 'Update or end calls'),
  ('crm.messages.read', 'View lead messages'),
  ('crm.messages.send', 'Send lead messages (single and bulk)'),
  ('crm.messages.update', 'Update lead message delivery status'),
  ('crm.chat.use', 'Use internal team chat'),
  ('crm.reports.read', 'View dashboards and reports'),
  ('crm.reports.export', 'Export report data'),
  ('crm.locations.read', 'View sales locations and executive locations'),
  ('crm.locations.manage', 'Create, edit and delete sales locations'),
  ('crm.locations.checkin', 'Report own current location'),
  ('settings.users.read', 'View organization members'),
  ('settings.users.manage', 'Add members, change roles and suspend members'),
  ('settings.organization.manage', 'Manage organization settings and diagnostics'),
  ('settings.audit.read', 'View the organization audit log')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_key, scope)
SELECT r.id, g.permission_key, g.scope
FROM roles r
CROSS JOIN (VALUES
  ('crm.leads.read', 'organization'),
  ('crm.leads.create', 'organization'),
  ('crm.leads.update', 'organization'),
  ('crm.leads.assign', 'organization'),
  ('crm.customers.read', 'organization'),
  ('crm.customers.create', 'organization'),
  ('crm.customers.update', 'organization'),
  ('crm.customers.delete', 'organization'),
  ('crm.opportunities.read', 'organization'),
  ('crm.opportunities.create', 'organization'),
  ('crm.opportunities.update', 'organization'),
  ('crm.opportunities.assign', 'organization'),
  ('crm.followups.read', 'organization'),
  ('crm.followups.create', 'organization'),
  ('crm.followups.update', 'organization'),
  ('crm.tasks.read', 'organization'),
  ('crm.tasks.create', 'organization'),
  ('crm.tasks.update', 'organization'),
  ('crm.tasks.delete', 'organization'),
  ('crm.notes.read', 'organization'),
  ('crm.notes.create', 'organization'),
  ('crm.notes.update', 'organization'),
  ('crm.notes.delete', 'organization'),
  ('crm.calls.read', 'organization'),
  ('crm.calls.create', 'organization'),
  ('crm.calls.update', 'organization'),
  ('crm.messages.read', 'organization'),
  ('crm.messages.send', 'organization'),
  ('crm.messages.update', 'organization'),
  ('crm.chat.use', 'organization'),
  ('crm.reports.read', 'organization'),
  ('crm.reports.export', 'organization'),
  ('crm.locations.read', 'organization'),
  ('crm.locations.manage', 'organization'),
  ('crm.locations.checkin', 'organization'),
  ('settings.users.read', 'organization'),
  ('settings.users.manage', 'organization'),
  ('settings.organization.manage', 'organization'),
  ('settings.audit.read', 'organization')
) AS g(permission_key, scope)
WHERE r.key = 'admin' AND r.organization_id IS NULL
ON CONFLICT (role_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

INSERT INTO role_permissions (role_id, permission_key, scope)
SELECT r.id, g.permission_key, g.scope
FROM roles r
CROSS JOIN (VALUES
  ('crm.leads.read', 'organization'),
  ('crm.leads.create', 'organization'),
  ('crm.leads.update', 'organization'),
  ('crm.leads.assign', 'organization'),
  ('crm.customers.read', 'organization'),
  ('crm.customers.create', 'organization'),
  ('crm.customers.update', 'organization'),
  ('crm.opportunities.read', 'organization'),
  ('crm.opportunities.create', 'organization'),
  ('crm.opportunities.update', 'own'),
  ('crm.opportunities.assign', 'organization'),
  ('crm.followups.read', 'organization'),
  ('crm.tasks.read', 'organization'),
  ('crm.tasks.create', 'organization'),
  ('crm.tasks.update', 'organization'),
  ('crm.tasks.delete', 'organization'),
  ('crm.notes.read', 'organization'),
  ('crm.notes.create', 'organization'),
  ('crm.notes.update', 'organization'),
  ('crm.notes.delete', 'organization'),
  ('crm.calls.read', 'organization'),
  ('crm.calls.create', 'organization'),
  ('crm.messages.read', 'organization'),
  ('crm.messages.send', 'organization'),
  ('crm.messages.update', 'organization'),
  ('crm.chat.use', 'organization'),
  ('crm.reports.read', 'organization'),
  ('crm.reports.export', 'organization'),
  ('crm.locations.read', 'organization'),
  ('settings.users.read', 'organization')
) AS g(permission_key, scope)
WHERE r.key = 'manager' AND r.organization_id IS NULL
ON CONFLICT (role_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

INSERT INTO role_permissions (role_id, permission_key, scope)
SELECT r.id, g.permission_key, g.scope
FROM roles r
CROSS JOIN (VALUES
  ('crm.leads.read', 'own'),
  ('crm.leads.create', 'own'),
  ('crm.leads.update', 'own'),
  ('crm.customers.read', 'own'),
  ('crm.customers.create', 'own'),
  ('crm.customers.update', 'own'),
  ('crm.opportunities.read', 'own'),
  ('crm.opportunities.create', 'own'),
  ('crm.opportunities.update', 'own'),
  ('crm.followups.read', 'own'),
  ('crm.followups.create', 'own'),
  ('crm.followups.update', 'own'),
  ('crm.tasks.read', 'own'),
  ('crm.tasks.create', 'own'),
  ('crm.tasks.update', 'own'),
  ('crm.notes.read', 'own'),
  ('crm.notes.create', 'own'),
  ('crm.notes.update', 'own'),
  ('crm.notes.delete', 'own'),
  ('crm.calls.read', 'own'),
  ('crm.calls.create', 'own'),
  ('crm.calls.update', 'own'),
  ('crm.messages.read', 'own'),
  ('crm.messages.send', 'own'),
  ('crm.messages.update', 'own'),
  ('crm.chat.use', 'organization'),
  ('crm.reports.read', 'own'),
  ('crm.reports.export', 'own'),
  ('crm.locations.checkin', 'own')
) AS g(permission_key, scope)
WHERE r.key = 'sales' AND r.organization_id IS NULL
ON CONFLICT (role_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

