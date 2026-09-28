import { pool } from './db.js';
import { errorFields, logger } from './logger.js';
import { getRequestContext } from './request-context.js';

const SENSITIVE_KEY = /pass(word)?|secret|token|hash|authorization|cookie|api[_-]?key/i;
const REDACTED = '[REDACTED]';

/** Deep-copies audit payloads with credential-like fields removed. */
export function redactAuditValues(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactAuditValues(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactAuditValues(inner, depth + 1);
    }
    return out;
  }
  return value;
}

export interface AuditEventInput {
  /** Omit to use the verified organization of the current request; null for platform events. */
  organizationId?: number | null;
  /** Omit to use the authenticated user of the current request. */
  userId?: number | null;
  action: string;
  tableName: string;
  recordId?: number | string | null;
  oldValues?: unknown;
  newValues?: unknown;
}

function toRecordId(value: AuditEventInput['recordId']): number | null {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(numeric) && numeric >= 0 && numeric <= 2_147_483_647 ? numeric : null;
}

/**
 * Writes an audit row stamped with organization, actor, request id, IP and user
 * agent from the request context. Never throws: auditing must not break the
 * business operation, failures are logged instead.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const context = getRequestContext();
  const organizationId =
    input.organizationId === undefined
      ? (context?.auth?.organizationId ?? null)
      : input.organizationId;
  const userId = input.userId === undefined ? (context?.auth?.userId ?? null) : input.userId;
  const oldValues =
    input.oldValues === undefined || input.oldValues === null
      ? null
      : redactAuditValues(input.oldValues);
  const newValues =
    input.newValues === undefined || input.newValues === null
      ? null
      : redactAuditValues(input.newValues);

  try {
    await pool.query(
      `INSERT INTO audit_logs
         (organization_id, user_id, action, table_name, record_id, old_values, new_values,
          ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        organizationId,
        userId,
        input.action.slice(0, 50),
        input.tableName.slice(0, 50),
        toRecordId(input.recordId),
        oldValues === null ? null : JSON.stringify(oldValues),
        newValues === null ? null : JSON.stringify(newValues),
        normalizeIp(context?.ip),
        context?.userAgent ?? null,
        context?.requestId ?? null,
      ],
    );
  } catch (error) {
    logger.error('audit_write_failed', { action: input.action, ...errorFields(error) });
  }
}

/** INET rejects values like "::ffff:127.0.0.1%eth0"; keep only parseable addresses. */
function normalizeIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const cleaned = ip.split('%')[0]!.trim();
  return /^[0-9a-fA-F:.]+$/.test(cleaned) ? cleaned : null;
}
