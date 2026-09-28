import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { REQUEST_ID_HEADER } from '@crm/types';
import type { NextFunction, Request, Response } from 'express';

/** Identity as established by the legacy JWT middleware (`req.user`). */
export interface ContextUser {
  userId: number;
  roleId: number;
}

/**
 * Per-request state available anywhere in the call chain without threading `req`.
 * Phase 2 adds `organizationId`, `membershipId` and `permissions` once tenancy exists;
 * they are intentionally absent until then rather than faked.
 */
export interface RequestContext {
  requestId: string;
  startedAt: number;
  user?: ContextUser;
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

export function setContextUser(user: ContextUser): void {
  const context = storage.getStore();
  if (context) context.user = user;
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
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
  storage.run({ requestId, startedAt: Date.now() }, next);
}
