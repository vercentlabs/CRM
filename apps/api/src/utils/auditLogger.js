import { recordAuditEvent } from '../platform/audit.js';

/**
 * Legacy positional wrapper around the Phase 2 audit writer.
 * Organization, actor, request id, IP and user agent come from the verified
 * request context; the ipAddress/userAgent arguments are kept for call-site
 * compatibility only. Credential-like fields are redacted before storage.
 */
const logAuditEvent = async (userId, action, tableName, recordId, oldValues = null, newValues = null) => {
  await recordAuditEvent({
    userId: userId ?? undefined,
    action,
    tableName,
    recordId,
    oldValues,
    newValues
  });
  return null;
};

export {
  logAuditEvent
};
