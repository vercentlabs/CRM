import type { ApiMeta, ApiSuccess } from '@crm/types';
import type { Response } from 'express';

/** Sends the `/api/v1` success envelope: `{ success: true, data, meta? }`. */
export function sendData<T>(
  res: Response,
  data: T,
  options: { status?: number; meta?: ApiMeta } = {},
): Response {
  const body: ApiSuccess<T> = { success: true, data };
  if (options.meta) body.meta = options.meta;
  return res.status(options.status ?? 200).json(body);
}
