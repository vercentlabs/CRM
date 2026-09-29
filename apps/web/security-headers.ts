/**
 * HTTP security headers for every web route (applied in next.config.ts).
 *
 * CSP: Next.js App Router hydration uses inline scripts, so script-src needs
 * 'unsafe-inline' unless per-request nonces are introduced (which would force
 * dynamic rendering of every page). Everything else is locked down: no
 * plugins, no framing, no foreign form targets, and network access only to
 * this origin and the API origin. Images may come from HTTPS (short-lived
 * signed attachment URLs from the storage provider).
 */
export interface HeaderOptions {
  apiBaseUrl: string;
  production: boolean;
}

export function contentSecurityPolicy({ apiBaseUrl, production }: HeaderOptions): string {
  let apiOrigin = '';
  try {
    apiOrigin = new URL(apiBaseUrl).origin;
  } catch {
    // Invalid configuration: only same-origin requests are allowed.
  }
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(production ? [] : ["'unsafe-eval'"])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...(apiOrigin ? [apiOrigin] : []), ...(production ? [] : ['ws:'])],
    'media-src': ["'self'", 'blob:', 'https:'],
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (production) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function securityHeaders(options: HeaderOptions): { key: string; value: string }[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(options) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()',
    },
    ...(options.production
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
      : []),
  ];
}
