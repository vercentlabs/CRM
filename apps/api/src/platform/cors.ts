import cors, { type CorsOptions } from 'cors';
import type { Request } from 'express';
import { REQUEST_ID_HEADER } from '@crm/types';
import { credentialedOrigins, env } from './env.js';

const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'x-csrf-token', REQUEST_ID_HEADER];
const EXPOSED_HEADERS = [REQUEST_ID_HEADER, 'Retry-After'];

/**
 * - Allow-listed browser origins (CORS_ORIGINS) may send credentials (the
 *   auth cookies).
 * - Production: every other browser origin gets no CORS headers at all, so
 *   browsers refuse cross-origin reads. Native mobile apps and server-to-server
 *   clients do not use CORS and are unaffected.
 * - Development/test: other origins get `*` without credentials (bearer only).
 */
export const corsMiddleware = cors((req: Request, callback) => {
  const origin = req.header('Origin')?.replace(/\/+$/, '');
  let options: CorsOptions;
  if (origin && credentialedOrigins.has(origin)) {
    options = {
      origin: true,
      credentials: true,
      allowedHeaders: ALLOWED_HEADERS,
      exposedHeaders: EXPOSED_HEADERS,
      maxAge: 600,
    };
  } else if (env.NODE_ENV === 'production') {
    options = { origin: false };
  } else {
    options = { origin: '*', allowedHeaders: ALLOWED_HEADERS, exposedHeaders: EXPOSED_HEADERS };
  }
  callback(null, options);
});
