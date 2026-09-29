#!/usr/bin/env node
/**
 * Worker readiness smoke (no dependencies). Exit code 0 = ready.
 *
 *   WORKER_HEALTH_URL=http://worker:9090 [METRICS_TOKEN=…] [WAIT_SECONDS=60] node scripts/smoke-worker.mjs
 *
 * Polls /health/ready until every check passes (database, durable queue,
 * outbox relay, not draining) or the wait expires, then verifies that
 * /metrics is protected and, with the token, exposes the queue/outbox gauges.
 */
const base = (process.env.WORKER_HEALTH_URL ?? 'http://127.0.0.1:9090').replace(/\/+$/, '');
const deadline = Date.now() + Number(process.env.WAIT_SECONDS ?? 60) * 1000;
let last = 'no response';
let ready = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`${base}/health/ready`);
    const body = await res.json();
    last = JSON.stringify(body.checks ?? body);
    if (res.status === 200) {
      ready = true;
      break;
    }
  } catch (error) {
    last = error instanceof Error ? error.message : String(error);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
if (!ready) {
  console.error(`FAIL  worker not ready: ${last}`);
  process.exit(1);
}
console.log(`PASS  worker ready: ${last}`);

const live = await fetch(`${base}/health/live`);
if (live.status !== 200) {
  console.error(`FAIL  liveness HTTP ${live.status}`);
  process.exit(1);
}
const unauthenticated = await fetch(`${base}/metrics`);
if (unauthenticated.status === 200) {
  console.error('FAIL  /metrics is public');
  process.exit(1);
}
console.log('PASS  /metrics is not public');
if (process.env.METRICS_TOKEN) {
  const res = await fetch(`${base}/metrics`, {
    headers: { authorization: `Bearer ${process.env.METRICS_TOKEN}` },
  });
  const text = await res.text();
  for (const metric of ['crm_outbox_events', 'crm_queue_jobs', 'crm_build_info']) {
    if (!text.includes(metric)) {
      console.error(`FAIL  metric ${metric} missing`);
      process.exit(1);
    }
  }
  console.log('PASS  metrics expose outbox and queue gauges');
}
