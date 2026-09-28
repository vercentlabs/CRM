import { idSchema, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@crm/validation';
import { z } from 'zod';

/** `/:id` path parameter (400 on malformed ids for v1). */
export const idParams = z.object({ id: idSchema });

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export interface Page {
  page: number;
  limit: number;
}

export const offsetOf = (page: Page) => (page.page - 1) * page.limit;

/**
 * Allow-listed sorting: `sort=field` or `sort=-field` (descending). The value
 * maps to a fixed SQL expression, so client input never reaches SQL text.
 */
export function sortQuery<const K extends string>(
  columns: Record<K, string>,
  defaultSort: NoInfer<`${'' | '-'}${K}`>,
) {
  const keys = Object.keys(columns) as K[];
  const allowed = keys.flatMap((key) => [key, `-${key}`]);
  return z
    .enum(allowed as [string, ...string[]], { error: `sort must be one of: ${allowed.join(', ')}` })
    .default(defaultSort)
    .transform((value) => {
      const descending = value.startsWith('-');
      const key = (descending ? value.slice(1) : value) as K;
      return `${columns[key]} ${descending ? 'DESC' : 'ASC'}`;
    });
}

export const optionalId = z.coerce.number().int().positive().optional();
export const optionalDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Invalid date' })
  .optional();
export const booleanQuery = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));
