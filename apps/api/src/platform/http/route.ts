import type { Permission, RecordScope } from '@crm/permissions';
import { toFieldIssues } from '@crm/validation';
import type { ApiMeta } from '@crm/types';
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireScope } from '../auth/middleware.js';
import type { AuthSubject } from '../auth/repository.js';
import { AppError } from './errors.js';
import { sendData } from './respond.js';

/**
 * Tiny route registry: one declaration per endpoint drives Express mounting,
 * input validation (Zod) and the OpenAPI document. No DI framework.
 */

type Schema = z.ZodType;
type Infer<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface HandlerContext<P = undefined, Q = undefined, B = undefined> {
  params: P;
  query: Q;
  body: B;
  /** Verified tenant identity (present on every authenticated route). */
  auth: AuthSubject;
  req: Request;
  res: Response;
}

export interface HandlerResult {
  data: unknown;
  meta?: ApiMeta;
  status?: number;
}

/** A controller: its input schemas plus the function that consumes the parsed input. */
export interface Controller<
  PS extends Schema | undefined,
  QS extends Schema | undefined,
  BS extends Schema | undefined,
> {
  params?: PS;
  query?: QS;
  body?: BS;
  /** Return a result for the standard envelope, or `undefined` after writing `res` directly (CSV, cookies). */
  handle: (
    ctx: HandlerContext<Infer<PS>, Infer<QS>, Infer<BS>>,
  ) => Promise<HandlerResult | undefined>;
}

export function controller<
  PS extends Schema | undefined = undefined,
  QS extends Schema | undefined = undefined,
  BS extends Schema | undefined = undefined,
>(spec: Controller<PS, QS, BS>): Controller<PS, QS, BS> {
  return spec;
}

export const ok = (data: unknown, meta?: ApiMeta): HandlerResult =>
  meta ? { data, meta } : { data };
export const created = (data: unknown): HandlerResult => ({ data, status: 201 });

/** Heterogeneous controllers share one registry; each is type-checked where it is declared. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyController = Controller<any, any, any>;

export interface RouteDefinition {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Express path relative to /api/v1, e.g. `/leads/:id`. */
  path: string;
  summary: string;
  tags: string[];
  /** Defaults to 'session'. 'public' routes skip authentication. */
  auth?: 'session' | 'public';
  permission?: Permission;
  /** Require at least this scope for `permission` (e.g. organization-wide reports). */
  scope?: RecordScope;
  /** Extra middleware run before validation (rate limiting, multipart parsing). */
  before?: RequestHandler[];
  /** Documentation: schema of `data` in the success envelope, and whether `meta.pagination` is present. */
  response?: Schema;
  paginated?: boolean;
  /** Documentation: non-JSON success body (e.g. text/csv) or multipart request. */
  produces?: string;
  consumes?: string;
  successStatus?: number;
  controller: AnyController;
}

export interface ApiModule {
  name: string;
  routes: RouteDefinition[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Parsed, validated input (set by `validate`). */
      validated?: { params: unknown; query: unknown; body: unknown };
    }
  }
}

function parsePart(schema: Schema | undefined, value: unknown, location: string): unknown {
  if (!schema) return undefined;
  const parsed = schema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  const details = toFieldIssues(parsed.error).map((issue) => ({
    ...issue,
    field: issue.field === '(root)' ? location : `${location}.${issue.field}`,
  }));
  throw AppError.validation(details, details[0]?.message ?? 'Validation failed');
}

/** Validates params/query/body before any service code runs; parsed values land on `req.validated`. */
export function validate(schemas: {
  params?: Schema;
  query?: Schema;
  body?: Schema;
}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validated = {
        params: parsePart(schemas.params, req.params, 'params'),
        query: parsePart(schemas.query, req.query, 'query'),
        body: parsePart(schemas.body, req.body, 'body'),
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Wraps a controller for Express: builds the context and sends the v1 envelope. */
export function runController(ctrl: AnyController, successStatus = 200): RequestHandler {
  return async (req, res) => {
    const result = await ctrl.handle({
      params: req.validated?.params,
      query: req.validated?.query,
      body: req.validated?.body,
      auth: req.auth!,
      req,
      res,
    });
    if (result === undefined || res.headersSent) return;
    sendData(res, result.data, {
      status: result.status ?? successStatus,
      ...(result.meta ? { meta: result.meta } : {}),
    });
  };
}

/** authenticated → permission/scope → extra middleware → validation → controller */
export function mountModules(router: Router, modules: ApiModule[]): void {
  for (const mod of modules) {
    for (const route of mod.routes) {
      const chain: RequestHandler[] = [];
      if (route.auth !== 'public') chain.push(authenticate);
      if (route.permission) {
        chain.push(
          route.scope
            ? requireScope(route.permission, route.scope)
            : requirePermission(route.permission),
        );
      }
      chain.push(...(route.before ?? []));
      chain.push(validate(route.controller));
      chain.push(runController(route.controller, route.successStatus));
      router[route.method](route.path, ...chain);
    }
  }
}

/** Standard pagination meta. */
export function paginationMeta(page: number, limit: number, total: number): ApiMeta {
  return { pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
