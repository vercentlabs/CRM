import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { GrantMap } from '@crm/permissions';
import { REQUEST_ID_HEADER } from '@crm/types';
import type { NextFunction, Request, Response } from 'express';

/**
 * Verified tenant/auth identity. Every field was loaded from the database for
 * this request (session → user → active membership → role → grants); nothing
 * here comes from client-supplied claims alone.
 */
export interface TenantAuth {
  userId: number;
  sessionId: string;
  organizationId: number;
  organizationPublicId: string;
  membershipId: number;
  roleKey: string;
  permissions: GrantMap;
}

export interface RequestContext {
  requestId: string;
  startedAt: number;
  auth?: TenantAuth;
  /** Source IP and user agent, captured once for audit logging. */
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Accept caller-supplied ids only when they are short and log-safe. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveRequestId(incoming: unknown): string {
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function setContextAuth(auth: TenantAuth): void {
  const context = storage.getStore();
  if (!context) return;
  context.auth = auth;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** First middleware: assigns/echoes `x-request-id` and opens the async context. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.get(REQUEST_ID_HEADER));
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  storage.run(
    { requestId, startedAt: Date.now(), ip: req.ip, userAgent: req.get('user-agent') },
    next,
  );
}
