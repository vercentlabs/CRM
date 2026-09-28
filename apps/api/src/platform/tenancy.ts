import type { Permission, RecordScope } from '@crm/permissions';
import type { Request, Response } from 'express';
import pool from '../config/db.js';
import { AppError } from './http/errors.js';
import { getRequestId } from './request-context.js';

type Queryable = Pick<typeof pool, 'query'>;

export interface Tenant {
  organizationId: number;
  userId: number;
}

/**
 * The ONLY way controllers obtain the organization: from the verified auth
 * subject. Request bodies/params/query are never trusted for tenancy.
 */
export function tenantOf(req: Request): Tenant {
  if (!req.auth) throw AppError.unauthenticated();
  return { organizationId: req.auth.organizationId, userId: req.auth.userId };
}

/** Scope granted for a permission, or null when not granted. */
export function scopeFor(req: Request, permission: Permission): RecordScope | null {
  return req.auth?.permissions.get(permission) ?? null;
}

export function hasPermission(req: Request, permission: Permission): boolean {
  return Boolean(req.auth?.permissions.has(permission));
}

export function isOrgWide(req: Request, permission: Permission): boolean {
  return scopeFor(req, permission) === 'organization';
}

/** Positive integer id or null (non-numeric ids are answered with 404, not a DB error). */
export function parseId(value: unknown): number | null {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,10}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 && id <= 2_147_483_647 ? id : null;
}

/** True when the user holds an active membership in the organization. */
export async function isActiveMember(
  organizationId: number,
  userId: unknown,
  db: Queryable = pool,
): Promise<boolean> {
  const id = parseId(userId);
  if (id === null) return false;
  const result = await db.query(
    `SELECT 1 FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active' AND COALESCE(u.is_active, true)`,
    [organizationId, id],
  );
  return result.rows.length > 0;
}

/** Returns the subset of user ids that are active members of the organization. */
export async function filterActiveMembers(
  organizationId: number,
  userIds: unknown[],
  db: Queryable = pool,
): Promise<number[]> {
  const ids = [...new Set(userIds.map(parseId).filter((id): id is number => id !== null))];
  if (ids.length === 0) return [];
  const result = await db.query(
    `SELECT m.user_id FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.organization_id = $1 AND m.user_id = ANY($2::int[]) AND m.status = 'active'
       AND COALESCE(u.is_active, true)`,
    [organizationId, ids],
  );
  return result.rows.map((row) => row.user_id);
}

/**
 * Logs an unexpected failure with the request id and returns a generic body.
 * Legacy controllers use it instead of echoing `error.message` to clients.
 */
export function serverError(res: Response, message: string, error: unknown): Response {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: message,
      requestId: getRequestId(),
      error:
        error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    }),
  );
  return res.status(500).json({ success: false, message, requestId: getRequestId() });
}
