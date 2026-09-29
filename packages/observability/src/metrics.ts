import { timingSafeEqual } from 'node:crypto';
import client from 'prom-client';

export { client as promClient };

/**
 * Prometheus metrics. Each process owns one registry with default process
 * metrics (prefixed `crm_<service>_`). Labels are low-cardinality only:
 * never organization ids, user ids, raw paths or error messages.
 */
export function createRegistry(
  service: 'api' | 'worker',
  build: { version: string; commit: string },
) {
  const registry = new client.Registry();
  registry.setDefaultLabels({ service });
  client.collectDefaultMetrics({ register: registry, prefix: `crm_${service}_` });
  new client.Gauge({
    name: 'crm_build_info',
    help: 'Build metadata (always 1)',
    labelNames: ['version', 'commit'],
    registers: [registry],
  }).set({ version: build.version, commit: build.commit }, 1);
  return registry;
}

export type Registry = client.Registry;

/** Constant-time bearer check for the metrics endpoint. */
export function metricsAuthorized(header: string | undefined, token: string | undefined): boolean {
  if (!token) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match) return false;
  const given = Buffer.from(match[1]!);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Status code → `2xx`/`4xx`/`5xx` label (bounded cardinality). */
export const statusClass = (status: number) => `${Math.floor(status / 100)}xx`;
