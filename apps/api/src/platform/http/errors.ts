import type { ApiFieldError, ErrorCode } from '@crm/types';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function codeForStatus(status: number): ErrorCode {
  const match = (Object.entries(STATUS_BY_CODE) as [ErrorCode, number][]).find(
    ([code, value]) => value === status && code !== 'VALIDATION_FAILED',
  );
  if (match) return match[0];
  return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
}

/**
 * Operational error that is safe to show to clients. Anything that is not an
 * AppError is treated as an unexpected 500 and its message is hidden.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ApiFieldError[] | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: ApiFieldError[]; cause?: unknown; status?: number } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? statusForCode(code);
    this.details = options.details;
  }

  static badRequest(message = 'Bad request') {
    return new AppError('BAD_REQUEST', message);
  }

  static validation(details: ApiFieldError[], message = 'Validation failed') {
    return new AppError('VALIDATION_FAILED', message, { details });
  }

  static unauthenticated(message = 'Authentication required') {
    return new AppError('UNAUTHENTICATED', message);
  }

  static forbidden(message = 'Access denied') {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string) {
    return new AppError('CONFLICT', message);
  }

  static serviceUnavailable(message = 'Service unavailable') {
    return new AppError('SERVICE_UNAVAILABLE', message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
