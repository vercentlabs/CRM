import { imageKitStorage, type FileStorage, type StoredFile } from '../../integrations/imagekit.js';
import { AppError } from '../../platform/http/errors.js';
import type { Actor } from '../../platform/tenancy.js';

/** Upload rules (unchanged from the historical upload route). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
]);

let storage: FileStorage = imageKitStorage;

/** Test seam for the storage provider. */
export function useStorage(adapter: FileStorage): void {
  storage = adapter;
}

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Stores a chat attachment under the organization's own folder (public UUID,
 * never the numeric id). No database row exists yet; the storage response is
 * returned to the caller, who references it in a chat message.
 */
export async function uploadChatAttachment(
  actor: Actor,
  file: IncomingFile | undefined,
): Promise<StoredFile> {
  if (!file) throw AppError.badRequest('No file uploaded');
  if (file.size > MAX_UPLOAD_BYTES)
    throw new AppError('PAYLOAD_TOO_LARGE', 'File size exceeds 10MB limit');
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw AppError.badRequest('Invalid file type. Only images, documents, and videos are allowed.');
  }
  try {
    return await storage.upload({
      buffer: file.buffer,
      fileName: file.originalname.slice(0, 200),
      folder: `organizations/${actor.organizationPublicId}/chat/attachments`,
      tags: ['chat', 'attachment'],
    });
  } catch (error) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Failed to upload file', { cause: error });
  }
}
