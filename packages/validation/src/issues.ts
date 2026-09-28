import type { z } from 'zod';

export interface FieldIssue {
  field: string;
  message: string;
}

/** Converts zod issues into the `{ field, message }[]` shape used by API validation errors. */
export function toFieldIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}
