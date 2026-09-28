import { API_V1_PREFIX, type ApiErrorResponse } from '@crm/types';
import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../request-context.js';
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

function logError(req: Request, appError: AppError, original: unknown): void {
  const entry = {
    level: appError.status >= 500 ? 'error' : 'warn',
    msg: 'request_failed',
    requestId: getRequestId() ?? req.requestId,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    status: appError.status,
    code: appError.code,
    error:
      original instanceof Error
        ? { name: original.name, message: original.message, stack: original.stack }
        : String(original),
  };
  if (appError.status >= 500) console.error(JSON.stringify(entry));
  else console.warn(JSON.stringify(entry));
}

/** 404 for unknown routes under /api/v1 (legacy routes keep Express's default 404). */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.baseUrl}${req.path} not found`));
}

/**
 * Terminal error middleware. Stack traces and internal messages are never sent
 * to clients in any environment; they are logged with the request id instead.
 * `/api/v1` uses the standard error envelope; legacy routes keep their
 * historical `{ success:false, message }` shape.
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

  if (req.originalUrl.startsWith(API_V1_PREFIX)) {
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
    return;
  }

  res.status(appError.status).json({
    success: false,
    message: appError.message,
    ...(appError.details ? { errors: appError.details } : {}),
    ...(requestId ? { requestId } : {}),
  });
}
