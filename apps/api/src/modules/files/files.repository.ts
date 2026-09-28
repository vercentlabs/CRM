import type { Queryable } from '@crm/database';
import type { Tenant } from '../../platform/tenancy.js';

/** File metadata (binary content lives in the storage provider). Always tenant-bound. */

export interface FileRow {
  id: number;
  public_id: string;
  uploaded_by: number | null;
  provider: string;
  provider_file_id: string;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: string;
  entity_type: string | null;
  entity_id: number | null;
  status: 'uploaded' | 'attached' | 'deleted';
}

const COLUMNS = `id, public_id, uploaded_by, provider, provider_file_id, url, filename, mime_type,
  size_bytes, entity_type, entity_id, status`;

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: {
    uploadedBy: number;
    provider: string;
    providerFileId: string;
    storageKey: string;
    url: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    purpose: 'chat_attachment';
    expiresAt: Date;
  },
): Promise<FileRow> {
  const result = await db.query(
    `INSERT INTO files (organization_id, uploaded_by, provider, provider_file_id, storage_key, url,
                        filename, mime_type, size_bytes, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${COLUMNS}`,
    [
      tenant.organizationId,
      data.uploadedBy,
      data.provider,
      data.providerFileId,
      data.storageKey,
      data.url,
      data.filename,
      data.mimeType,
      data.sizeBytes,
      data.purpose,
      data.expiresAt,
    ],
  );
  return result.rows[0];
}

/** Locks a live (not deleted) file of the organization by its public id. */
export async function lockLive(
  db: Queryable,
  tenant: Tenant,
  publicId: string,
): Promise<FileRow | null> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM files
     WHERE organization_id = $1 AND public_id::text = $2 AND status <> 'deleted'
     FOR UPDATE`,
    [tenant.organizationId, publicId],
  );
  return result.rows[0] ?? null;
}

export async function attach(
  db: Queryable,
  tenant: Tenant,
  id: number,
  entity: { type: 'chat_message'; id: number },
): Promise<void> {
  await db.query(
    `UPDATE files SET status = 'attached', entity_type = $3, entity_id = $4, attached_at = now(),
                      expires_at = NULL
     WHERE organization_id = $1 AND id = $2 AND status = 'uploaded'`,
    [tenant.organizationId, id, entity.type, entity.id],
  );
}

export async function markDeleted(db: Queryable, tenant: Tenant, id: number): Promise<void> {
  await db.query(
    `UPDATE files SET status = 'deleted', deleted_at = now(), expires_at = NULL
     WHERE organization_id = $1 AND id = $2 AND status <> 'deleted'`,
    [tenant.organizationId, id],
  );
}

/** Detaches a deleted file from its chat message so no message points at a removed object. */
export async function clearChatAttachment(
  db: Queryable,
  tenant: Tenant,
  messageId: number,
  url: string,
) {
  await db.query(
    `UPDATE chat_messages cm SET attachment_url = NULL, file_type = NULL, message_type = 'text'
     FROM chat_conversations c
     WHERE cm.id = $2 AND c.id = cm.conversation_id AND c.organization_id = $1 AND cm.attachment_url = $3`,
    [tenant.organizationId, messageId, url],
  );
}
