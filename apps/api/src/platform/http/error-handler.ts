import type { ApiErrorResponse } from '@crm/types';
import type { NextFunction, Request, Response } from 'express';
import { captureError } from '@crm/observability';
import { errorFields, logger } from '../logger.js';
import { authFailures, dbErrors } from '../metrics.js';
import { getRequestId } from '../request-context.js';
import { routeTemplate } from './access-log.js';
import { AppError, codeForStatus, isAppError } from './errors.js';

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  expose?: boolean;
  type?: string;
  code?: string;
  name?: string;
  message?: string;
}

/**
 * Converts anything thrown into a client-safe AppError.
 * - AppError: passed through.
 * - body-parser / http-errors with `expose: true` (4xx): message kept.
 * - multer limit errors: 400/413 with the multer message.
 * - Everything else: generic 500, original error only logged server-side.
 */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) return error;

  const candidate = (typeof error === 'object' && error !== null ? error : {}) as HttpLikeError;

  if (candidate.type === 'entity.parse.failed') {
    return new AppError('BAD_REQUEST', 'Malformed JSON request body', { cause: error });
  }
  if (candidate.type === 'entity.too.large') {
    return new AppError('PAYLOAD_TOO_LARGE', 'Request body too large', { cause: error });
  }
  if (candidate.name === 'MulterError') {
    const tooLarge = candidate.code === 'LIMIT_FILE_SIZE';
    return new AppError(
      tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      candidate.message ?? 'Upload rejected',
      {
        cause: error,
      },
    );
  }

  const status = candidate.status ?? candidate.statusCode;
  if (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    candidate.expose &&
    candidate.message
  ) {
    return new AppError(codeForStatus(status), candidate.message, { cause: error, status });
  }

  return new AppError('INTERNAL_ERROR', 'Internal server error', { cause: error });
}

/**
 * Unexpected failures (bugs, unhandled driver errors) are logged at error with
 * a stack and reported. A deliberate AppError with a 5xx status (a dependency
 * that is down or not configured) is an operational condition: warn, no stack,
 * no report — HTTP metrics and alerts on 5xx rates still count it.
 */
const isUnexpected = (appError: AppError, original: unknown) =>
  appError.status >= 500 && (appError.code === 'INTERNAL_ERROR' || !isAppError(original));

function logError(req: Request, appError: AppError, original: unknown): void {
  const unexpected = isUnexpected(appError, original);
  const fields = {
    method: req.method,
    route: routeTemplate(req),
    status: appError.status,
    code: appError.code,
    ...errorFields(original, unexpected),
  };
  const pgCode = (original as { code?: unknown } | null)?.code;
  if (typeof pgCode === 'string' && /^[0-9A-Z]{5}$/.test(pgCode)) dbErrors.inc({ kind: 'query' });
  if (unexpected) {
    logger.error('request_failed', fields);
    captureError(original, {
      requestId: getRequestId() ?? req.requestId,
      route: fields.route,
      method: req.method,
      organizationId: req.auth?.organizationId,
      userId: req.auth?.userId,
    });
  } else {
    logger.warn('request_failed', fields);
  }
}

/**
 * JSON 404 for unknown routes. Mounted inside /api/v1 and after every other
 * router, so removed pre-v1 endpoints answer with the standard envelope.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.baseUrl}${req.path} not found`));
}

/**
 * Terminal error middleware. Stack traces and internal messages are never sent
 * to clients in any environment; they are logged with the request id instead.
 * Every response uses the standard error envelope.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = normalizeError(error);
  const requestId = getRequestId() ?? req.requestId;
  if (appError.status >= 500 || !isAppError(error)) logError(req, appError, error);
  if (appError.status === 401 || /CSRF/.test(appError.message)) {
    const route = routeTemplate(req);
    authFailures.inc({
      reason: /CSRF/.test(appError.message)
        ? 'csrf'
        : route.endsWith('/auth/login')
          ? 'credentials'
          : route.endsWith('/auth/refresh')
            ? 'refresh'
            : 'token',
    });
  }

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      ...(requestId ? { requestId } : {}),
    },
  };
  res.status(appError.status).json(body);
}
