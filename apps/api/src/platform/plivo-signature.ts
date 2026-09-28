import type { NextFunction, Request, Response } from 'express';
import plivo from 'plivo';
import { env } from './env.js';

type V3Validator = (
  method: string,
  uri: string,
  nonce: string,
  authToken: string,
  signature: string,
  params?: Record<string, unknown>,
) => boolean;

// The SDK's own implementation (HMAC-SHA256 over URL + sorted params + nonce).
// The pre-Phase-2 code called `plivo.utils.validateSignatureV3`, which does not
// exist, so every webhook was rejected.
const validateV3Signature = (plivo as unknown as { validateV3Signature: V3Validator })
  .validateV3Signature;

/**
 * Rebuilds the exact public URL Plivo called. PLIVO_WEBHOOK_URL is the public
 * URL of `<mount>/webhook` (callbacks are registered as `${PLIVO_WEBHOOK_URL}/answer`),
 * so the part of the request URL after the internal `/webhook` prefix (path +
 * query) is appended to it. This also works when a proxy adds a path prefix.
 */
export function publicWebhookUrl(req: Request, baseUrl: string): string {
  const internalBase = `${req.baseUrl}/webhook`;
  const suffix = req.originalUrl.startsWith(internalBase)
    ? req.originalUrl.slice(internalBase.length)
    : req.originalUrl.slice(req.baseUrl.length);
  return `${baseUrl.replace(/\/+$/, '')}${suffix}`;
}

export function isValidPlivoSignature(req: Request, authToken: string, baseUrl: string): boolean {
  const signature = req.get('X-Plivo-Signature-V3');
  const nonce = req.get('X-Plivo-Signature-V3-Nonce');
  if (!signature || !nonce || (req.method !== 'POST' && req.method !== 'GET')) return false;
  try {
    const params =
      req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
    return validateV3Signature(
      req.method,
      publicWebhookUrl(req, baseUrl),
      nonce,
      authToken,
      signature,
      params,
    );
  } catch {
    return false;
  }
}

/**
 * Rejects webhook calls that are not signed by Plivo. Fails closed when
 * PLIVO_WEBHOOK_URL is not configured (the signature covers the public URL,
 * which cannot be inferred safely behind proxies). Final end-to-end
 * verification against the deployed URL is tracked for Phase 7.
 */
export function verifyPlivoSignature(req: Request, res: Response, next: NextFunction): void {
  if (
    !env.PLIVO_WEBHOOK_URL ||
    !isValidPlivoSignature(req, env.PLIVO_AUTH_TOKEN, env.PLIVO_WEBHOOK_URL)
  ) {
    res.status(403).json({ message: 'Invalid signature' });
    return;
  }
  next();
}
