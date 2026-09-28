import { z } from 'zod';

export type RuntimeEnvironment = 'development' | 'test' | 'production';

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(appName: string, issues: readonly string[]) {
    super(
      `[${appName}] Invalid environment configuration:\n` +
        issues.map((issue) => `  - ${issue}`).join('\n'),
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/** Accepts common string spellings of booleans used in .env files. */
export const booleanString = z.union([z.boolean(), z.string()]).transform((value, ctx) => {
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
  ctx.addIssue({ code: 'custom', message: 'must be a boolean (true/false)' });
  return z.NEVER;
});

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

/** Treats empty strings as "not set" so `KEY=` in a .env file behaves like a missing key. */
export function emptyToUndefined(source: Record<string, string | undefined>) {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    result[key] = value === undefined || value.trim() === '' ? undefined : value;
  }
  return result;
}

/**
 * Validates environment variables against a zod schema.
 * Error messages name the offending variables but never echo their values,
 * so secrets cannot leak into logs.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  options: { appName: string; source?: Record<string, string | undefined> },
): z.output<TSchema> {
  const source = emptyToUndefined(options.source ?? process.env);
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)';
    const message =
      issue.code === 'invalid_type' && source[key] === undefined ? 'is required' : issue.message;
    return `${key} ${message}`;
  });
  throw new EnvValidationError(options.appName, issues);
}

/** Refinement helper: requires a key only when running in production. */
export function requiredInProduction<T extends { NODE_ENV: RuntimeEnvironment }>(
  keys: readonly (keyof T & string)[],
) {
  return (env: T, ctx: z.RefinementCtx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of keys) {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production' });
      }
    }
  };
}
