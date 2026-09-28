import { z } from 'zod';
import { EMAIL_PATTERN } from '../common.js';

/** Treats '' (common from HTML forms) as "no value", like the legacy `x || null`. */
export const emptyToNull = (value: unknown) => (value === '' ? null : value);

/** Optional, nullable free text; '' becomes null. */
export const nullableText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

/** Optional nullable positive integer id (assignees, locations); accepts numeric strings. */
export const nullableId = z.preprocess(
  emptyToNull,
  z.coerce.number({ error: 'Must be a numeric id' }).int().positive().nullable(),
);

/** Required positive integer id; accepts numeric strings. */
export const requiredId = (message: string) =>
  z.coerce.number({ error: message }).int({ error: message }).positive({ error: message });

/** Optional nullable number; '' becomes null. */
export const nullableNumber = z.preprocess(emptyToNull, z.coerce.number().nullable());

/** Any string PostgreSQL can parse as a timestamp/date (ISO, or `YYYY-MM-DDTHH:mm` from date inputs). */
export const dateLike = (message = 'Invalid date') =>
  z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message });

export const nullableDate = (message?: string) =>
  z.preprocess(emptyToNull, dateLike(message).nullable());

export const tenDigitPhone = (message: string) =>
  z.string({ error: message }).regex(/^\d{10}$/, message);

export const optionalEmail = (message: string) =>
  z.preprocess(emptyToNull, z.string().trim().regex(EMAIL_PATTERN, message).max(255).nullable());

export const booleanLike = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);

/** Requires at least one defined property (PATCH bodies). */
export const nonEmptyPatch = <T extends z.ZodRawShape>(
  shape: T,
  message = 'No valid fields to update',
) =>
  z.object(shape).refine((value) => Object.values(value).some((v) => v !== undefined), { message });
