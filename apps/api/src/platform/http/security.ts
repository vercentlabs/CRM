import type { BuildInfo } from '@crm/observability';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

/**
 * HTTP security headers for a JSON API: nothing may be framed, sniffed or
 * executed; HSTS in production (also sent by the TLS terminator ideally).
 * The web app sets its own headers in next.config.
 */
export function securityHeaders(production: boolean): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    xDnsPrefetchControl: { allow: false },
  });
}

/**
 * Authenticated CRM data must never be stored by browsers or shared caches:
 * every API response defaults to `Cache-Control: no-store` (a handler may
 * override it). Also identifies the release for incident correlation.
 */
export function apiResponseDefaults(build: BuildInfo): RequestHandler {
  const version = `${build.version}+${build.commit}`;
  return (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-CRM-Version', version);
    next();
  };
}
