/** Prefix for all versioned API routes. Unversioned legacy routes remain until Phase 3. */
export const API_V1_PREFIX = '/api/v1';

/** Correlation header accepted from clients and echoed on every API response. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Stable, machine-readable error codes. Clients branch on `code`, never on `message`. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: ApiFieldError[];
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiMeta {
  pagination?: PaginationMeta;
  [key: string]: unknown;
}

/** `/api/v1` success envelope. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

/** `/api/v1` error envelope. */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse;

/**
 * Envelope produced by the legacy (unversioned) routes via `utils/response.js`.
 * Kept so shared clients can read both shapes during the migration.
 */
export interface LegacyApiEnvelope<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: unknown;
  errors?: ApiFieldError[];
}
