import type { Response } from 'express';

/**
 * DEPRECATED `{ success, message, data? }` envelope of the pre-v1 API
 * (formerly utils/response.js). Only legacy adapters use it.
 */
export function sendSuccess(
  res: Response,
  message: string,
  data: unknown = null,
  statusCode = 200,
): Response {
  return res
    .status(statusCode)
    .json(data === null ? { success: true, message } : { success: true, message, data });
}
