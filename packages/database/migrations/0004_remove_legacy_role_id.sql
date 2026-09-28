-- Phase 5: remove the legacy numeric role model.
--
-- Authorization has used organization_memberships.role_id → role_permissions
-- since Phase 2. With the pre-v1 routes and every client-side `roleId` removed
-- (web: Phase 4, mobile + API DTOs: Phase 5), nothing reads the legacy ids:
--
--   users.role_id          DEPRECATED since 0002 (nullable, not written by new
--                          code). The per-organization role of every user was
--                          copied into organization_memberships by 0003.
--   roles.legacy_role_id   1/2/3 alias of the built-in roles, used only to map
--                          users.role_id (0003) and to echo `roleId` in DTOs.
--
-- No database object reads either column any more: the baseline views and the
-- users.role_id-based procedure assign_leads_to_sales were dropped by 0003.
--
-- Kept: the built-in role rows and their primary keys 1/2/3 (admin/manager/
-- sales), which memberships and role_permissions reference.
--
-- Reviewed destructive statements: the two DROP COLUMNs remove only the
-- deprecated ids above (their index, check, unique and foreign-key constraints
-- go with them); no business data is removed. The whole file runs in one
-- transaction.
-- crm:allow-destructive

ALTER TABLE users DROP COLUMN IF EXISTS role_id;

ALTER TABLE roles DROP COLUMN IF EXISTS legacy_role_id;

COMMENT ON TABLE roles IS
    'Built-in (organization_id NULL; ids 1 admin, 2 manager, 3 sales) and organization custom roles. Grants live in role_permissions.';
