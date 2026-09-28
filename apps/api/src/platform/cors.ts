import cors, { type CorsOptions } from 'cors';
import type { Request } from 'express';
import { REQUEST_ID_HEADER } from '@crm/types';
import { credentialedOrigins } from './env.js';

const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'x-csrf-token', REQUEST_ID_HEADER];

/**
 * - Allow-listed browser origins (CORS_ORIGINS / FRONTEND_URL) may send
 *   credentials (the auth cookies).
 * - Every other origin keeps the pre-Phase-2 behaviour: `*` without
 *   credentials, which only works with bearer tokens (mobile/API clients).
 */
export const corsMiddleware = cors((req: Request, callback) => {
  const origin = req.header('Origin')?.replace(/\/+$/, '');
  const options: CorsOptions =
    origin && credentialedOrigins.has(origin)
      ? {
          origin: true,
          credentials: true,
          allowedHeaders: ALLOWED_HEADERS,
          exposedHeaders: [REQUEST_ID_HEADER],
        }
      : { origin: '*', allowedHeaders: ALLOWED_HEADERS, exposedHeaders: [REQUEST_ID_HEADER] };
  callback(null, options);
});
