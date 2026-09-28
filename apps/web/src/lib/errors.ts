import { ApiClientError } from '@crm/api-client';

export interface DisplayError {
  message: string;
  requestId?: string | undefined;
  status: number;
}

const FALLBACK: Record<number, string> = {
  0: 'Unable to reach the server. Check your connection and try again.',
  401: 'Your session has expired. Sign in again.',
  403: 'You do not have permission to do this.',
  404: 'This record does not exist or is not available to you.',
  409: 'This conflicts with existing data.',
  429: 'Too many attempts. Wait a moment and try again.',
};

/** A safe, user-facing description of any error (never stack traces or SQL). */
export function toDisplayError(error: unknown): DisplayError {
  if (error instanceof ApiClientError) {
    if (error.status >= 500) {
      return {
        status: error.status,
        requestId: error.requestId,
        message:
          'The server could not complete the request. Try again, and quote the reference if it keeps happening.',
      };
    }
    return {
      status: error.status,
      requestId: error.requestId,
      message: error.message || FALLBACK[error.status] || 'The request could not be completed.',
    };
  }
  return {
    status: 0,
    message: 'Something went wrong in the browser. Reload the page and try again.',
  };
}

export const errorMessage = (error: unknown) => toDisplayError(error).message;

export const isStatus = (error: unknown, status: number) =>
  error instanceof ApiClientError && error.status === status;
