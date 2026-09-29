/**
 * Central redaction for everything that leaves the process as a log line or
 * an error report. Key-based (any field whose name looks like a credential)
 * and value-based (bearer tokens, credentials inside URLs, token query
 * parameters, JWT-shaped strings). Applied to every log field — callers do not
 * have to remember it.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|signature|credential|session[-_]?id|otp|ciphertext|^sig$/i;

/** Keys that match the pattern above but are safe identifiers or counters. */
const SAFE_KEYS = new Set([
  'tokenType',
  'token_type',
  'failure_code',
  'errorCode',
  'error_code',
  'statusCode',
  'code_verifier_length',
]);

const VALUE_PATTERNS: Array<[RegExp, string]> = [
  // Authorization: Bearer <token>
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  // scheme://user:password@host (database/Redis URLs)
  [/\b([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s@/]+)@/gi, `$1$2:${REDACTED}@`],
  // ?token=…&sig=… style query parameters
  [
    /([?&](?:token|access_token|refresh_token|reset_token|sig|signature|key|apikey|api_key|password|code)=)[^&\s#"']+/gi,
    `$1${REDACTED}`,
  ],
  // JWT-shaped values
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, REDACTED],
  // Webhook signing secrets we issue
  [/\bwhsec_[A-Za-z0-9_-]{8,}/g, REDACTED],
];

export function redactString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of VALUE_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Deep copy with sensitive keys masked and string values scrubbed. Bounded depth and size. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string')
    return redactString(value.length > 4000 ? `${value.slice(0, 4000)}…` : value);
  if (typeof value !== 'object') return value;
  if (depth > 6) return '[Truncated]';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (value instanceof Error) return redactError(value);
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      SENSITIVE_KEY.test(key) && !SAFE_KEYS.has(key) && inner !== null && inner !== undefined
        ? REDACTED
        : redact(inner, depth + 1);
  }
  return out;
}

/** Error → safe fields (name, code, first line of message; stack only on request). */
export function redactError(error: unknown, withStack = false): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: redactString(String(error)).slice(0, 300) };
  const code = (error as { code?: unknown }).code;
  return {
    name: error.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
    message: redactString(error.message.split('\n')[0] ?? '').slice(0, 300),
    ...(withStack && error.stack ? { stack: redactString(error.stack) } : {}),
  };
}
