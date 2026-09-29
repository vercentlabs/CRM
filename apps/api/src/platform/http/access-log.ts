import { statusClass } from '@crm/observability';
import type { Request, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { httpActive, httpDuration, httpRequests } from '../metrics.js';

/** Route template (e.g. `/api/v1/leads/:id`) — never the raw path with ids. */
export function routeTemplate(req: Request): string {
  const route = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof route !== 'string') return 'unmatched';
  // After a router exits Express resets req.baseUrl; recover the mount prefix.
  const prefix =
    req.baseUrl || ['/api/v1', '/api/plivo'].find((p) => req.originalUrl.startsWith(`${p}/`)) || '';
  return `${prefix}${route}`;
}

/**
 * HTTP access log + request metrics. Logs method, route template, status,
 * duration and (from the request context) request/organization/user ids —
 * never bodies, queries, headers or uploaded content. Slow requests are logged
 * as `http_request_slow`; health probes and metrics scrapes only at debug.
 */
export function accessLog(options: { slowMs: number }): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    httpActive.inc();
    res.on('finish', () => {
      httpActive.dec();
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = routeTemplate(req);
      const labels = { method: req.method, route, status: statusClass(res.statusCode) };
      httpRequests.inc(labels);
      httpDuration.observe(labels, seconds);
      const durationMs = Math.round(seconds * 1000);
      const fields = { method: req.method, route, status: res.statusCode, durationMs };
      const quiet = route.startsWith('/api/v1/health') || req.path === '/metrics';
      if (durationMs >= options.slowMs) logger.warn('http_request_slow', fields);
      else if (res.statusCode === 500) logger.error('http_request', fields);
      else if (res.statusCode >= 500) logger.warn('http_request', fields);
      else if (quiet) logger.debug('http_request', fields);
      else logger.info('http_request', fields);
    });
    next();
  };
}
