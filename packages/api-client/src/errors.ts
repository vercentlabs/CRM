import type { ApiFieldError, ErrorCode } from '@crm/types';

export type ApiClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'ABORTED' | 'UNKNOWN';

/** Single error type thrown by the client for HTTP, network and timeout failures. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiClientErrorCode;
  readonly details: ApiFieldError[] | undefined;
  readonly requestId: string | undefined;
  readonly body: unknown;

  constructor(init: {
    message: string;
    status: number;
    code: ApiClientErrorCode;
    details?: ApiFieldError[] | undefined;
    requestId?: string | undefined;
    body?: unknown;
    cause?: unknown;
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'ApiClientError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
    this.body = init.body;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

export function codeForStatus(status: number): ApiClientErrorCode {
  return STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Builds an ApiClientError from any response body. Understands both the
 * `/api/v1` envelope (`{ success:false, error:{ code, message } }`) and the
 * legacy envelope (`{ success:false, message, error|errors }`).
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  requestId?: string,
): ApiClientError {
  let message = `Request failed with status ${status}`;
  let code = codeForStatus(status);
  let details: ApiFieldError[] | undefined;

  if (isRecord(body)) {
    const error = body.error;
    if (isRecord(error) && typeof error.message === 'string') {
      message = error.message;
      if (typeof error.code === 'string') code = error.code as ApiClientErrorCode;
      if (Array.isArray(error.details)) details = error.details as ApiFieldError[];
      // The server's id is authoritative (it may have replaced an unsafe client id).
      if (typeof error.requestId === 'string') requestId = error.requestId;
    } else if (typeof body.message === 'string') {
      message = body.message;
      if (Array.isArray(body.errors)) details = body.errors as ApiFieldError[];
    }
  } else if (typeof body === 'string' && body.trim() !== '' && body.length < 300) {
    message = body.trim();
  }

  return new ApiClientError({ message, status, code, details, requestId, body });
}
