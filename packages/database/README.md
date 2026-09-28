# @crm/database

This package handles PostgreSQL access for the API, the worker and tooling. Clients (web and mobile) must never depend on it.

- `createPool(options)` creates a `pg` pool with the CRM defaults and type parsers (INT8 is returned as a number).
- `checkDatabase(pool)` runs a `SELECT 1` health probe with a timeout and returns no error details.
- The migration runner is exposed as `migrate`, `migrationStatus` and `baseline`, plus the `crm-migrate` CLI.

## Migrations

| Command (repo root)                  | Effect                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate`                    | Apply pending migrations in version order                                                                               |
| `pnpm db:migrate:status`             | List each file as `applied`, `baseline` or `pending`                                                                    |
| `pnpm db:migrate:baseline [version]` | **One time, for existing databases only:** record migrations ≤ version (default `0001`) as applied without running them |

`DATABASE_URL` is read from the environment, then `./.env`, then `apps/api/.env`.

### Rules

1. **Files:** `migrations/NNNN_snake_case.sql`. The next number is the highest existing number + 1, and numbers are never reused.
2. **Forward-only.** There are no down migrations. To fix a mistake, add a new migration.
3. **Immutable once applied.** The runner stores a sha256 checksum (line endings are normalized) and refuses to continue if an applied file has changed.
4. **One transaction per file.** A file that must run outside a transaction (e.g. `CREATE INDEX CONCURRENTLY`) must contain the line `-- crm:no-transaction`.
5. **Destructive SQL is blocked.** `DROP TABLE|SCHEMA|DATABASE|COLUMN`, `ALTER TABLE … DROP <col>`, `TRUNCATE` and `DELETE FROM` are refused unless the file contains `-- crm:allow-destructive`. Add that marker only after human review.
6. **Serialized runs.** A Postgres advisory lock prevents two deploys from migrating at the same time.
7. **Multi-tenant work (Phase 2+):** add `organization_id` as nullable, backfill, then enforce `NOT NULL` in a later migration. Always index `(organization_id, …)`.

### Baseline

`0001_baseline_schema.sql` is the pre-Phase-1 `schema.sql`, moved unchanged. Its header still says it is a "reference snapshot … managed via pgAdmin", which is historically accurate.

- **Fresh database:** `pnpm db:migrate` creates the full schema.
- **Existing (pgAdmin-managed) database:** the runner detects the existing `users` table with no history and stops. Verify the schema matches the baseline, then run `pnpm db:migrate:baseline` once, then `pnpm db:migrate`.

## Shipped migrations

| File                             | Purpose                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_baseline_schema.sql`       | Pre-Phase-1 schema snapshot (unchanged)                                                                                               |
| `0002_saas_identity.sql`         | Organizations, org-aware roles, permissions, role_permissions, memberships, sessions, and hashed refresh tokens                       |
| `0003_tenant_ownership.sql`      | `organization_id` on business tables, backfill into one legacy organization, NOT NULL, per-org uniques, composite FKs and indexes     |
| `0004_remove_legacy_role_id.sql` | Drops the legacy numeric role ids `users.role_id` and `roles.legacy_role_id` (roles are per membership; built-in role ids 1/2/3 stay) |

Tenancy rules are in `docs/architecture/TENANCY_AND_AUTH.md`. A fresh database has no organization: run `pnpm org:bootstrap` (env: `BOOTSTRAP_ORG_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`).

The pre-Phase-2 `legacy/` scripts (a destructive `init-db.js`, admin inserts containing a real email and password hash, and note "fix" scripts that moved rows across tenants) were removed in Phase 2. They remain only in git history.

## Tests

`pnpm --filter @crm/database test` runs the unit tests. Set `TEST_DATABASE_URL` to a disposable Postgres to also run the integration tests; each run uses its own schema and drops it afterwards.
