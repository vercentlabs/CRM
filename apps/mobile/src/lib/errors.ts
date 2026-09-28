import { ApiClientError } from '@crm/api-client';

export type ErrorKind =
  | 'network'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'unavailable'
  | 'server'
  | 'unknown';

export interface DisplayError {
  kind: ErrorKind;
  title: string;
  message: string;
  requestId?: string | undefined;
}

/**
 * One mapping from any error to user-facing text. Server (5xx) messages are
 * never shown verbatim; the request id is kept for support.
 */
export function toDisplayError(error: unknown): DisplayError {
  if (!(error instanceof ApiClientError)) {
    return { kind: 'unknown', title: 'Something went wrong', message: 'Please try again.' };
  }
  const requestId = error.requestId;
  if (error.status === 0) {
    return {
      kind: 'network',
      title:
        error.code === 'TIMEOUT' ? 'The server is taking too long' : 'You appear to be offline',
      message: 'Check your connection and try again.',
      requestId,
    };
  }
  if (error.status === 401)
    return {
      kind: 'unauthenticated',
      title: 'Session expired',
      message: 'Sign in again to continue.',
      requestId,
    };
  if (error.status === 403)
    return {
      kind: 'forbidden',
      title: "You don't have access",
      message: error.message || 'Your role does not allow this.',
      requestId,
    };
  if (error.status === 404)
    return {
      kind: 'not-found',
      title: 'Not found',
      message: error.message || 'This record does not exist or is not available to you.',
      requestId,
    };
  if (error.status === 409)
    return { kind: 'conflict', title: 'Already exists', message: error.message, requestId };
  if (error.status === 400 || error.status === 422)
    return { kind: 'validation', title: 'Check the form', message: error.message, requestId };
  if (error.status === 503)
    return {
      kind: 'unavailable',
      title: 'Temporarily unavailable',
      message: 'The service is not available right now. Try again later.',
      requestId,
    };
  return {
    kind: 'server',
    title: 'Server error',
    message:
      'The server could not complete the request. Try again, and quote the reference if it keeps happening.',
    requestId,
  };
}

export const errorMessage = (error: unknown) => toDisplayError(error).message;

export const isStatus = (error: unknown, status: number) =>
  error instanceof ApiClientError && error.status === status;
