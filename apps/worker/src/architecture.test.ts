import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Runtime-platform guardrails: queue internals stay in the worker, clients
 * never touch server infrastructure, and worker data access is tenant-bound.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const apps = path.resolve(here, '../..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === '.next' || name === '__tests__')
      return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const rel = (f: string) => path.relative(apps, f).split(path.sep).join('/');
const read = (f: string) => readFileSync(f, 'utf8');

describe('runtime platform architecture', () => {
  it('web and mobile never import queues, Redis, the database, events or provider adapters', () => {
    const client = [...files(path.join(apps, 'web/src')), ...files(path.join(apps, 'mobile/src'))];
    expect(client.length).toBeGreaterThan(50);
    const offenders = client.filter((f) =>
      /from '(bullmq|ioredis|pg|@crm\/database|@crm\/events|@crm\/integrations)'/.test(read(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('only the worker queue layer touches BullMQ', () => {
    const worker = files(path.join(apps, 'worker/src')).filter((f) => !f.endsWith('.test.ts'));
    const users = worker
      .filter((f) => /from 'bullmq'/.test(read(f)))
      .map(rel)
      .sort();
    expect(users).toEqual(['worker/src/queue-check.ts', 'worker/src/queue/bullmq.ts']);
  });

  it('binds every tenant-table statement in worker data access to an organization', () => {
    // Platform scans (reminders, upload expiry, outbox claiming) are explicitly listed.
    const platform = new Set([
      'createDueReminders',
      'expireUnattachedUploads',
      'staleProviderDeletions',
      'claimBatch',
      'markProcessed',
      'release',
      'markDead',
      'prune',
      'stats',
      'lockPasswordReset',
      'setResetTokenHash',
      'markResetEmailed',
      'lockEmailDelivery',
      'setEmailDelivery',
    ]);
    const dbFiles = files(path.join(apps, 'worker/src/db'));
    const offenders: string[] = [];
    for (const file of dbFiles) {
      const text = read(file);
      for (const match of text.matchAll(
        /export async function (\w+)\(([\s\S]*?)\)[^{]*\{([\s\S]*?)\n\}/g,
      )) {
        const [, name, params, body] = match;
        if (platform.has(name!)) continue;
        if (!/organizationId/.test(params! + body!) || !/organization_id/.test(body!))
          offenders.push(`${rel(file)}:${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('processors call providers only through @crm/integrations interfaces', () => {
    const worker = files(path.join(apps, 'worker/src')).filter((f) => !f.endsWith('.test.ts'));
    expect(
      worker.filter((f) => /from '(imagekit|nodemailer|plivo)'/.test(read(f))).map(rel),
    ).toEqual([]);
  });
});
