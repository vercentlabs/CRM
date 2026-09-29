import { randomUUID } from 'node:crypto';
import { withTransaction, type DatabaseClient } from '@crm/database';
import type { ChatMessage, StoredFile } from '@crm/types';
import { pool } from '../../platform/db.js';
import { assertWithinLimit, requireFeature } from '../../platform/entitlements.js';
import { emit } from '../../platform/events.js';
import { AppError } from '../../platform/http/errors.js';
import { env } from '../../platform/env.js';
import { errorFields, logger } from '../../platform/logger.js';
import { fileStorage } from '../../platform/providers.js';
import { can, type Actor } from '../../platform/tenancy.js';
import { addUsage, lockUsage, readUsage } from '../../platform/usage.js';
import * as files from './files.repository.js';
import { ALLOWED_TYPES, matchesDeclaredType, sanitizeFilename } from './files.sniff.js';

/** Upload rules (size unchanged from the historical upload route). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set(Object.keys(ALLOWED_TYPES));
/** Uploads never attached to a message are purged by the worker after this. */
const UNATTACHED_TTL_MS = 24 * 60 * 60 * 1000;

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Files are read through short-lived signed URLs issued after an
 * authorization check (FILE_URL_TTL_SECONDS). Historical messages that
 * predate file tracking keep their stored URL (documented limitation).
 */
const signed = (row: { url: string; provider_file_id: string }) =>
  fileStorage().signedUrl(
    { url: row.url, providerFileId: row.provider_file_id },
    env.FILE_URL_TTL_SECONDS,
  );

const toStoredFile = (row: files.FileRow): StoredFile => ({
  id: row.public_id,
  fileId: row.public_id,
  url: signed(row),
  name: row.filename,
  size: Number(row.size_bytes),
  fileType: row.mime_type,
});

/**
 * Stores a chat attachment and records its metadata. The storage key is
 * generated here (organization public id + random id + an extension derived
 * from the verified type); the user's filename is only a sanitized display
 * name. Stored bytes are metered and checked against the plan's storage limit.
 */
export async function uploadChatAttachment(
  actor: Actor,
  file: IncomingFile | undefined,
): Promise<StoredFile> {
  await requireFeature(actor, 'files.upload');
  if (!file) throw AppError.badRequest('No file uploaded');
  if (file.size > MAX_UPLOAD_BYTES || file.buffer.length > MAX_UPLOAD_BYTES)
    throw new AppError('PAYLOAD_TOO_LARGE', 'File size exceeds 10MB limit');
  const type = ALLOWED_TYPES[file.mimetype];
  if (!type) {
    throw AppError.badRequest('Invalid file type. Only images, documents, and videos are allowed.');
  }
  if (!matchesDeclaredType(file.mimetype, file.buffer)) {
    throw AppError.badRequest('The file content does not match its declared type.');
  }
  const size = file.buffer.length;
  const limitMessage = 'Your plan’s file storage limit has been reached.';
  // Fast pre-check; re-checked under a lock when the metadata row is written.
  await assertWithinLimit(
    pool,
    actor.organizationId,
    'storage.bytes',
    await readUsage(pool, actor.organizationId, 'storage.bytes'),
    size,
    limitMessage,
  );

  const storage = fileStorage();
  const folder = `organizations/${actor.organizationPublicId}/chat/attachments`;
  let stored;
  try {
    stored = await storage.put({
      buffer: file.buffer,
      folder,
      name: `${randomUUID()}${type.ext}`,
      tags: ['chat', 'attachment'],
    });
  } catch (error) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Failed to upload file', { cause: error });
  }

  try {
    const row = await withTransaction(pool, async (tx) => {
      const used = await lockUsage(tx, actor.organizationId, 'storage.bytes');
      await assertWithinLimit(tx, actor.organizationId, 'storage.bytes', used, size, limitMessage);
      const inserted = await files.insert(tx, actor, {
        uploadedBy: actor.userId,
        provider: stored.provider,
        providerFileId: stored.providerFileId,
        storageKey: `${folder}/${stored.providerFileId}`,
        url: stored.url,
        filename: sanitizeFilename(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: size,
        purpose: 'chat_attachment',
        expiresAt: new Date(Date.now() + UNATTACHED_TTL_MS),
      });
      await addUsage(tx, actor.organizationId, 'storage.bytes', size);
      return inserted;
    });
    return toStoredFile(row);
  } catch (error) {
    // The object was stored but not recorded: remove it (best effort) so nothing is orphaned.
    await storage
      .delete(stored.providerFileId)
      .catch((cleanup: unknown) =>
        logger.warn('orphan_upload_cleanup_failed', errorFields(cleanup)),
      );
    throw error;
  }
}

/**
 * Attaches an uploaded file to a new chat message (same transaction as the
 * message insert). Only the uploader may attach, and only once.
 */
export async function attachToChatMessage(
  tx: DatabaseClient,
  actor: Actor,
  publicId: string,
): Promise<{ file: files.FileRow; attach: (messageId: number) => Promise<void> }> {
  const file = await files.lockLive(tx, actor, publicId);
  if (!file || file.uploaded_by !== actor.userId || file.status !== 'uploaded') {
    throw AppError.validation([
      { field: 'file_id', message: 'Attachment not found or already used' },
    ]);
  }
  return {
    file,
    attach: (messageId) =>
      files.attach(tx, actor, file.id, { type: 'chat_message', id: messageId }),
  };
}

/**
 * Deletes a file: metadata first (status 'deleted', usage released, any chat
 * message detached), then the worker removes the provider object from the
 * `file.deleted` event. The uploader or an organization manager may delete.
 */
export async function deleteFile(actor: Actor, publicId: string): Promise<void> {
  await withTransaction(pool, async (tx) => {
    const file = await files.lockLive(tx, actor, publicId);
    if (!file) throw AppError.notFound('File not found');
    if (file.uploaded_by !== actor.userId && !can(actor, 'settings.organization.manage')) {
      throw AppError.forbidden('You can only delete files you uploaded');
    }
    await files.markDeleted(tx, actor, file.id);
    if (file.entity_type === 'chat_message' && file.entity_id !== null) {
      await files.clearChatAttachment(tx, actor, file.entity_id, file.url);
    }
    await addUsage(tx, actor.organizationId, 'storage.bytes', -Number(file.size_bytes));
    await emit(tx, actor, 'file.deleted', file.id, { fileId: file.id });
  });
}

/** Replaces a tracked attachment's stored URL with a signed one; strips internal fields. */
export function signAttachment(
  row: ChatMessage & { file_id: string | null; file_provider_id: string | null },
): ChatMessage {
  const { file_provider_id, ...message } = row;
  if (file_provider_id && message.attachment_url) {
    message.attachment_url = signed({
      url: message.attachment_url,
      provider_file_id: file_provider_id,
    });
  }
  return message;
}

/** Short-lived URL for a file the actor may read; everything else is a uniform 404. */
export async function fileAccessUrl(
  actor: Actor,
  publicId: string,
): Promise<{ url: string; expiresAt: string }> {
  const file = await files.findReadable(pool, actor, publicId, actor.userId);
  if (!file) throw AppError.notFound('File not found');
  return {
    url: signed(file),
    expiresAt: new Date(Date.now() + env.FILE_URL_TTL_SECONDS * 1000).toISOString(),
  };
}
