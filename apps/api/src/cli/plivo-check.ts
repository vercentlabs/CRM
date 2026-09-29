#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { checkPlivoWebhookUrl } from '@crm/integrations';

/**
 * `pnpm plivo:check [--probe]` — Plivo webhook configuration diagnostic.
 *
 * Validates PLIVO_WEBHOOK_URL (environment, or apps/api/.env) and prints the
 * exact URLs to configure in the Plivo console. With --probe it POSTs an
 * UNSIGNED request to each public URL and expects 403: that proves the URL
 * reaches this API and that signature verification is enforced. Nothing is
 * sent to Plivo and no credentials are printed.
 */
async function main(): Promise<number> {
  if (!process.env.PLIVO_WEBHOOK_URL && existsSync(path.resolve('.env'))) {
    process.loadEnvFile(path.resolve('.env'));
  }
  const production = process.env.NODE_ENV === 'production';
  const result = checkPlivoWebhookUrl(process.env.PLIVO_WEBHOOK_URL, { production });
  if (!result.ok || !result.urls) {
    for (const problem of result.problems) console.error(`FAIL  ${problem}`);
    return 1;
  }
  const { urls } = result;
  console.log('PASS  PLIVO_WEBHOOK_URL is valid\n');
  console.log('Configure in the Plivo console / application:');
  console.log(`  Answer URL (POST)            ${urls.answer}   (also sent per call)`);
  console.log(`  Hangup URL (POST)            ${urls.status}   (also sent per call)`);
  console.log(`  Recording callback (POST)    ${urls.recording}   (set in the answer XML)`);
  console.log(`  SMS delivery report (POST)   ${urls.messageStatus}   (sent with each SMS)`);
  console.log('All four verify X-Plivo-Signature-V3 with PLIVO_AUTH_TOKEN.');
  if (!process.env.PLIVO_AUTH_ID || !process.env.PLIVO_AUTH_TOKEN) {
    console.log('\nWARN  PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN are not set in this environment.');
  }

  if (!process.argv.includes('--probe')) return 0;
  console.log('\nProbing (unsigned requests must be rejected with 403):');
  let failed = false;
  for (const [name, url] of Object.entries(urls)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', connection: 'close' },
        body: 'probe=1',
        signal: controller.signal,
      });
      await res.arrayBuffer();
      const ok = res.status === 403;
      failed ||= !ok;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} HTTP ${res.status}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL  ${name.padEnd(14)} unreachable (${(error as Error).name})`);
    } finally {
      clearTimeout(timer);
    }
  }
  return failed ? 1 : 0;
}

// exitCode (not process.exit) lets open HTTP sockets close cleanly first.
main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
