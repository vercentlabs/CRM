#!/usr/bin/env node
/**
 * HTTP performance smoke against a running API (no dependencies).
 *
 *   API_URL=http://127.0.0.1:5000 SMOKE_EMAIL=… SMOKE_PASSWORD=… \
 *     node scripts/perf-smoke.mjs [--requests 400] [--concurrency 20]
 *
 * Logs in once (bearer), then fires authenticated GETs at the hot list
 * endpoints with fixed concurrency and reports throughput and latency
 * percentiles per endpoint. It measures one API instance and one database in
 * whatever environment it runs in: report the environment with the numbers.
 * Read-only; never point it at production without an agreed window.
 */
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const base = (process.env.API_URL ?? 'http://127.0.0.1:5000').replace(/\/+$/, '');
const total = arg('requests', 400);
const concurrency = arg('concurrency', 20);

async function login() {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: process.env.SMOKE_EMAIL,
      password: process.env.SMOKE_PASSWORD,
      client: 'mobile',
    }),
  });
  if (res.status !== 200) throw new Error(`login failed: HTTP ${res.status}`);
  return (await res.json()).data.accessToken;
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function run(path, token) {
  const latencies = [];
  let errors = 0;
  let next = 0;
  const started = performance.now();
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < total) {
      next += 1;
      const t0 = performance.now();
      try {
        const res = await fetch(`${base}${path}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        await res.arrayBuffer();
        if (res.status !== 200) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - t0);
    }
  });
  await Promise.all(workers);
  const seconds = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    path,
    requests: latencies.length,
    errors,
    rps: (latencies.length / seconds).toFixed(0),
    p50: percentile(latencies, 50).toFixed(1),
    p95: percentile(latencies, 95).toFixed(1),
    p99: percentile(latencies, 99).toFixed(1),
  };
}

const token = await login();
const paths = [
  '/api/v1/health/ready',
  '/api/v1/auth/session',
  '/api/v1/leads?limit=20',
  '/api/v1/leads?limit=20&status=Qualified&page=50',
  '/api/v1/tasks?limit=20',
  '/api/v1/notifications?limit=20',
  '/api/v1/reports/dashboard-summary',
];
console.log(`API ${base} · ${total} requests per endpoint · concurrency ${concurrency}\n`);
console.log('| Endpoint | Requests | Errors | Req/s | p50 ms | p95 ms | p99 ms |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
let failed = false;
for (const path of paths) {
  const r = await run(path, token);
  failed ||= r.errors > 0;
  console.log(
    `| ${r.path} | ${r.requests} | ${r.errors} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} |`,
  );
}
process.exitCode = failed ? 1 : 0;
