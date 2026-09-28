'use client';

import { ApiClientError } from '@crm/api-client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';

/**
 * React Hook Form bound to a shared @crm/validation schema: the browser
 * validates with exactly the rules the API applies, and submits the parsed
 * output. Inputs hold strings; the schemas coerce them ('' → null, numbers).
 */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  options: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'> = {},
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  return useForm<z.input<S>, unknown, z.output<S>>({
    // The resolver's generic signature cannot express preprocess-heavy schemas precisely.
    resolver: zodResolver(schema as never) as never,
    mode: 'onTouched',
    ...options,
  });
}

/**
 * Maps API validation details (`body.email`, `email`) onto form fields.
 * Returns a message for errors that are not tied to a known field.
 */
export function applyServerErrors<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
  error: unknown,
): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const known = new Set(Object.keys(form.getValues() ?? {}));
  const unmatched: string[] = [];
  for (const detail of error.details ?? []) {
    const field = detail.field.replace(/^(body|query|params)\./, '');
    if (known.has(field)) {
      form.setError(field as Path<T>, { type: 'server', message: detail.message });
    } else {
      unmatched.push(detail.message);
    }
  }
  if (error.details && error.details.length > 0 && unmatched.length === 0) return null;
  return unmatched[0] ?? error.message;
}
