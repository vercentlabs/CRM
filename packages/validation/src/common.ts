import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Positive integer identifiers as used by the current serial primary keys. */
export const idSchema = z.coerce.number().int().positive();

export const idParamSchema = z.object({ id: idSchema });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Same pattern the legacy auth controller uses, kept identical for compatibility. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailSchema = z.string().trim().regex(EMAIL_PATTERN, 'Invalid email format');
