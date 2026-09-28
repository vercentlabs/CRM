import type { RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../platform/http/errors.js';
import { controller, created, type ApiModule } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, uploadChatAttachment } from './files.service.js';

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
  url: z.string(),
  fileId: z.string(),
  name: z.string(),
  size: z.number(),
  fileType: z.string(),
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
      before: [singleFile],
      consumes: 'multipart/form-data',
      controller: upload,
      response: storedFileSchema,
      successStatus: 201,
    },
  ],
};
