import { appendEvent } from '@crm/events';
import type { DatabasePool, Queryable } from '@crm/database';
import { withTransaction } from '@crm/database';

// ---------------------------------------------------------------- files

export interface DeletedFile {
  id: number;
  provider: string;
  provider_file_id: string;
}

/** A deleted file whose provider object still has to be removed. */
export async function pendingProviderDeletion(
  db: Queryable,
  organizationId: number,
  fileId: number,
): Promise<DeletedFile | null> {
  const result = await db.query(
    `SELECT id, provider, provider_file_id FROM files
     WHERE id = $1 AND organization_id = $2 AND status = 'deleted' AND provider_deleted_at IS NULL`,
    [fileId, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function markProviderDeleted(db: Queryable, organizationId: number, fileId: number) {
  await db.query(
    `UPDATE files SET provider_deleted_at = now()
     WHERE id = $1 AND organization_id = $2 AND status = 'deleted' AND provider_deleted_at IS NULL`,
    [fileId, organizationId],
  );
}

/**
 * Expires unattached uploads: metadata marked deleted, storage usage released
 * and a `file.deleted` event written in the same transaction (the normal
 * deletion path then removes the provider object). Rows are claimed with
 * SKIP LOCKED so concurrent sweeps never double-process.
 */
export async function expireUnattachedUploads(pool: DatabasePool, batch = 100): Promise<number> {
  return withTransaction(pool, async (tx) => {
    const expired = await tx.query(
      `SELECT id, organization_id, size_bytes FROM files
       WHERE status = 'uploaded' AND expires_at < now()
       ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batch],
    );
    for (const file of expired.rows as Array<{
      id: number;
      organization_id: number;
      size_bytes: string;
    }>) {
      await tx.query(
        `UPDATE files SET status = 'deleted', deleted_at = now(), expires_at = NULL
         WHERE id = $1 AND organization_id = $2`,
        [file.id, file.organization_id],
      );
      await tx.query(
        `UPDATE usage_counters SET value = GREATEST(value - $2::bigint, 0), updated_at = now()
         WHERE organization_id = $1 AND metric = 'storage.bytes' AND period = 'lifetime'`,
        [file.organization_id, file.size_bytes],
      );
      await appendEvent(tx, {
        type: 'file.deleted',
        organizationId: file.organization_id,
        actorUserId: null,
        aggregateId: file.id,
        payload: { fileId: file.id },
      });
    }
    return expired.rows.length;
  });
}

/** Deleted files whose provider cleanup is overdue (e.g. every attempt failed). */
export async function staleProviderDeletions(db: Queryable, olderThanMinutes: number, limit = 100) {
  const result = await db.query(
    `SELECT id, organization_id FROM files
     WHERE status = 'deleted' AND provider_deleted_at IS NULL
       AND deleted_at < now() - make_interval(mins => $1)
     ORDER BY deleted_at LIMIT $2`,
    [olderThanMinutes, limit],
  );
  return result.rows as Array<{ id: number; organization_id: number }>;
}

// ---------------------------------------------------------------- webhooks

export async function subscribedEndpoints(
  db: Queryable,
  organizationId: number,
  eventType: string,
) {
  const result = await db.query(
    `SELECT id FROM webhook_endpoints
     WHERE organization_id = $1 AND active AND $2 = ANY(event_types)`,
    [organizationId, eventType],
  );
  return result.rows as Array<{ id: number }>;
}

/** One delivery per (endpoint, event); returns its id (existing or new). */
export async function ensureDelivery(
  db: Queryable,
  organizationId: number,
  endpointId: number,
  event: { id: string; type: string },
): Promise<number> {
  const result = await db.query(
    `INSERT INTO webhook_deliveries (organization_id, endpoint_id, event_id, event_type)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint_id, event_id) DO UPDATE SET updated_at = webhook_deliveries.updated_at
     RETURNING id`,
    [organizationId, endpointId, event.id, event.type],
  );
  return result.rows[0].id;
}

export interface DeliveryTarget {
  id: number;
  public_id: string;
  status: string;
  event_id: string;
  endpoint_active: boolean;
  url: string;
  secret_ciphertext: string;
  organization_public_id: string;
}

export async function lockDelivery(
  db: Queryable,
  organizationId: number,
  deliveryId: number,
): Promise<DeliveryTarget | null> {
  const result = await db.query(
    `SELECT d.id, d.public_id, d.status, d.event_id, e.active AS endpoint_active, e.url,
            e.secret_ciphertext, o.public_id AS organization_public_id
     FROM webhook_deliveries d
     JOIN webhook_endpoints e ON e.id = d.endpoint_id AND e.organization_id = d.organization_id
     JOIN organizations o ON o.id = d.organization_id
     WHERE d.id = $1 AND d.organization_id = $2
     FOR UPDATE OF d`,
    [deliveryId, organizationId],
  );
  return result.rows[0] ?? null;
}

export async function setDelivery(
  db: Queryable,
  organizationId: number,
  deliveryId: number,
  change: {
    status: 'delivering' | 'delivered' | 'failed' | 'cancelled' | 'pending';
    responseStatus?: number | null;
    error?: string | null;
  },
) {
  await db.query(
    `UPDATE webhook_deliveries
     SET status = $3::varchar,
         attempts = attempts + CASE WHEN $3::varchar = 'delivering' THEN 1 ELSE 0 END,
         response_status = COALESCE($4::int, response_status),
         last_error = $5,
         delivered_at = CASE WHEN $3::varchar = 'delivered' THEN now() ELSE delivered_at END,
         failed_at = CASE WHEN $3::varchar = 'failed' THEN now() ELSE failed_at END,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      deliveryId,
      organizationId,
      change.status,
      change.responseStatus ?? null,
      change.error?.slice(0, 300) ?? null,
    ],
  );
}
