import { pool } from '../../platform/db.js';
import type { Actor } from '../../platform/tenancy.js';
import * as audit from './audit.repository.js';

/** Read-only: the tenant boundary comes from the actor. Writing stays in platform/audit.ts. */
export const listAuditLogs = (
  actor: Actor,
  filter: audit.AuditFilter,
  paging: { limit: number; offset: number },
) => audit.list(pool, actor, filter, paging);
