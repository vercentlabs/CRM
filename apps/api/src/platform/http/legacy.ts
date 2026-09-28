import type { Permission, RecordScope } from '@crm/permissions';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { authenticate, requirePermission, requireScope } from '../auth/middleware.js';
import { actorFrom, parseId, type Actor } from '../tenancy.js';
import { AppError } from './errors.js';
import { validate } from './route.js';

/**
 * DEPRECATED legacy (unversioned) endpoints. Adapters only translate the
 * historical request/response shapes; the business logic is the same module
 * service the /api/v1 routes use. Removed after the web (Phase 4) and mobile
 * (Phase 5) clients move to /api/v1.
 */

export interface LegacyContext<B = unknown, Q = unknown> {
  actor: Actor;
  body: B;
  query: Q;
  req: Request;
  res: Response;
}

type Schema = z.ZodType;

/** authenticate → permission → (validation) → adapter; marks responses as deprecated. */
export function legacyRoute<
  BS extends Schema | undefined = undefined,
  QS extends Schema | undefined = undefined,
>(options: {
  permission?: Permission;
  scope?: RecordScope;
  body?: BS;
  query?: QS;
  /** Extra middleware after authentication/permission (e.g. multipart parsing). */
  before?: RequestHandler[];
  /** Transform the legacy body before validation (e.g. camelCase → snake_case). */
  mapBody?: (body: Record<string, unknown>) => unknown;
  handle: (
    ctx: LegacyContext<
      BS extends Schema ? z.output<BS> : undefined,
      QS extends Schema ? z.output<QS> : undefined
    >,
  ) => Promise<unknown>;
}): RequestHandler[] {
  const chain: RequestHandler[] = [authenticate];
  if (options.permission) {
    chain.push(
      options.scope
        ? requireScope(options.permission, options.scope)
        : requirePermission(options.permission),
    );
  }
  chain.push(...(options.before ?? []));
  if (options.mapBody) {
    const map = options.mapBody;
    chain.push((req, _res, next) => {
      req.body = map((req.body ?? {}) as Record<string, unknown>);
      next();
    });
  }
  chain.push(
    validate({
      ...(options.body ? { body: options.body } : {}),
      ...(options.query ? { query: options.query } : {}),
    }),
  );
  chain.push(async (req: Request, res: Response, _next: NextFunction) => {
    res.setHeader('Deprecation', 'true');
    await options.handle({
      actor: actorFrom(req.auth!),
      body: req.validated?.body as never,
      query: req.validated?.query as never,
      req,
      res,
    });
  });
  return chain;
}

/** Legacy routes answered malformed ids with 404 (never a DB error). */
export function legacyId(value: unknown, notFoundMessage: string): number {
  const id = parseId(value);
  if (id === null) throw AppError.notFound(notFoundMessage);
  return id;
}

/** Legacy pagination object used by /leads, /opportunities and /audit. */
export function legacyPagination(page: number, limit: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/** Lenient page/limit parsing identical to the historical `parseInt(...) || default` behaviour. */
export function legacyPage(query: Record<string, unknown>, defaults = { limit: 20 }) {
  const page = Math.max(parseInt(String(query.page ?? '')) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(query.limit ?? '')) || defaults.limit, 1), 100);
  return { page, limit };
}
