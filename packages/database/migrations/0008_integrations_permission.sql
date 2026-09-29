-- Phase 7: dedicated permission for outbound webhook management.
--
-- Webhook endpoints carry signing secrets and send CRM data to third parties,
-- so managing them is separate from general organization settings. Only the
-- built-in Admin role receives it; Manager and Sales do not. Organizations can
-- grant it to custom roles. Additive only: no existing grant changes.

INSERT INTO permissions (key, description) VALUES
  ('settings.integrations.manage', 'Manage outbound webhooks and integration secrets')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions (role_id, permission_key, scope)
SELECT r.id, 'settings.integrations.manage', 'organization'
FROM roles r
WHERE r.key = 'admin' AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;
