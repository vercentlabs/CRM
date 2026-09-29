import type { RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../platform/http/errors.js';
import { controller, created, ok, type ApiModule } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import { policies, rateLimit } from '../../platform/rate-limit.js';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  deleteFile,
  fileAccessUrl,
  uploadChatAttachment,
} from './files.service.js';

/** In-memory multipart parsing with the historical size/type limits (fails before storage). */
const singleFile: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_MIME_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(
          AppError.badRequest('Invalid file type. Only images, documents, and videos are allowed.'),
        ),
}).single('file');

export const storedFileSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  fileId: z.string(),
  name: z.string(),
  size: z.number(),
  fileType: z.string(),
});

const remove = controller({
  params: z.object({ id: z.uuid() }),
  handle: async ({ auth, params }) => {
    await deleteFile(actorFrom(auth), params.id);
    return ok({ deleted: true });
  },
});

const accessUrl = controller({
  params: z.object({ id: z.uuid() }),
  handle: async ({ auth, params }) => ok(await fileAccessUrl(actorFrom(auth), params.id)),
});

const upload = controller({
  handle: async ({ auth, req }) => created(await uploadChatAttachment(actorFrom(auth), req.file)),
});

export const filesModule: ApiModule = {
  name: 'files',
  routes: [
    {
      method: 'post',
      path: '/files/chat-attachments',
      summary: 'Upload a chat attachment (multipart field `file`, max 10 MB)',
      tags: ['Files'],
      permission: 'crm.chat.use',
      before: [rateLimit(policies.sensitive), singleFile],
      consumes: 'multipart/form-data',
      controller: upload,
      response: storedFileSchema,
      successStatus: 201,
    },
    {
      method: 'get',
      path: '/files/:id/url',
      summary:
        'Short-lived signed URL for a file (uploader or participant of the conversation it belongs to)',
      tags: ['Files'],
      permission: 'crm.chat.use',
      controller: accessUrl,
      response: z.object({ url: z.string(), expiresAt: z.string() }),
    },
    {
      method: 'delete',
      path: '/files/:id',
      summary:
        'Delete an uploaded file (uploader or organization manager); storage is cleaned up asynchronously',
      tags: ['Files'],
      permission: 'crm.chat.use',
      controller: remove,
      response: z.object({ deleted: z.literal(true) }),
    },
  ],
};
