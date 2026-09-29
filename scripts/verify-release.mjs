#!/usr/bin/env node
/**
 * Release gate: `pnpm verify:release` (and `pnpm verify:release:e2e`).
 *
 * Fails unless every automated check passes on this checkout:
 *   1. repository hygiene and secret scan of tracked files
 *   2. migration immutability (migrations.lock.json)
 *   3. formatting, lint, typecheck
 *   4. ALL tests, with PostgreSQL and Redis required — database-backed suites
 *      skip themselves without TEST_DATABASE_URL, so the gate refuses to run
 *      without it rather than "pass" with half the suite skipped
 *   5. production builds of every package
 *   6. (--e2e) Playwright web E2E against E2E_DATABASE_URL
 *
 * Exit code 0 = releasable from the code side. Infrastructure and operator
 * actions are tracked separately in docs/operations/LAUNCH_CHECKLIST.md.
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e2e = process.argv.includes('--e2e');
const onlyIndex = process.argv.indexOf('--only');
/** `--only <text>` runs just the steps whose name contains <text> (CI jobs, local reruns). */
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : undefined;
const results = [];

function step(name, fn) {
  if (only && !name.includes(only)) return;
  const started = Date.now();
  process.stdout.write(`\n▶ ${name}\n`);
  try {
    fn();
    results.push([name, 'PASS', Date.now() - started]);
  } catch (error) {
    results.push([
      name,
      'FAIL',
      Date.now() - started,
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

const require = createRequire(import.meta.url);
/** Tools run through their JavaScript entry points: no shell, no platform shims. */
const TOOLS = {
  turbo: () => require.resolve('turbo/bin/turbo'),
  prettier: () => require.resolve('prettier/bin/prettier.cjs'),
  playwright: () => path.join(root, 'apps/web/node_modules/@playwright/test/cli.js'),
};

function run(tool, args, { cwd = root, env = {} } = {}) {
  const result = spawnSync(process.execPath, [TOOLS[tool](), ...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0)
    throw new Error(`${tool} ${args.join(' ')} exited with ${result.status}`);
}

const tracked = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);

// ------------------------------------------------------------------ 1. hygiene
step('repository hygiene and secret scan', () => {
  const files = tracked();
  const problems = [];
  const forbiddenPath = [
    /(^|\/)\.env(\.[^/]*)?$/, // .env, .env.local … (examples are allowed below)
    /(^|\/)node_modules\//,
    /(^|\/)(dist|\.next|build|coverage|test-results|playwright-report|\.turbo|\.expo)\//,
    /\.(log|pem|key|p12|pfx|jks|keystore|dump|rdb|aof)$/i,
    /(^|\/)(dump\.rdb|appendonly\.aof)$/,
  ];
  for (const file of files) {
    if (/\.env\.example$|\.env\.[a-z]+\.example$/.test(file)) continue;
    if (forbiddenPath.some((re) => re.test(file)))
      problems.push(`tracked file must not be committed: ${file}`);
  }
  const secretPatterns = [
    ['private key', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
    ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
    ['Stripe live key', /\bsk_live_[A-Za-z0-9]{16,}\b/],
    ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['ImageKit private key', /\bprivate_[A-Za-z0-9+/=]{20,}\b/],
    [
      'connection string with password',
      /\b(postgres(ql)?|redis|rediss|mongodb(\+srv)?):\/\/[^:\s/'"`]+:(?!\$|\{|<|\*|\[REDACTED\]|pw\b|password\b|crm\b|crm_test_pw\b|e2e_pw\b|pass\b|secret\b|change)[^@\s'"`]{6,}@(?!(localhost|127\.0\.0\.1|postgres|redis|db|host)[:/])/,
    ],
  ];
  for (const file of files) {
    if (/\.(png|jpe?g|gif|ico|webp|woff2?|ttf|lock|lockb)$|pnpm-lock\.yaml$/.test(file)) continue;
    let text;
    try {
      if (statSync(path.join(root, file)).size > 2_000_000) continue;
      text = readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const [name, re] of secretPatterns) {
      if (re.test(text)) problems.push(`possible ${name} in ${file}`);
    }
  }
  // Server code logs through the structured logger only (redaction).
  for (const file of files) {
    // CLI entry points print for humans (apps/api/src/cli/*, the worker's queue:check).
    if (
      !/^apps\/(api|worker)\/src\/.*\.ts$/.test(file) ||
      /\.test\.ts$|\/cli\/|queue-check\.ts$/.test(file)
    ) {
      continue;
    }
    if (/\bconsole\.(log|info|debug)\(/.test(readFileSync(path.join(root, file), 'utf8'))) {
      problems.push(`console logging in server code (use the logger): ${file}`);
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
});

// ------------------------------------------------------------ 2. migrations
step('migration immutability', () => {
  // Same normalisation as the migration runner's checksum (CRLF → LF, SHA-256).
  const dir = path.join(root, 'packages/database/migrations');
  const lock = JSON.parse(
    readFileSync(path.join(root, 'packages/database/migrations.lock.json'), 'utf8'),
  );
  const actual = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => [
        f,
        createHash('sha256')
          .update(readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'))
          .digest('hex'),
      ]),
  );
  const problems = [];
  for (const [file, sum] of Object.entries(lock)) {
    if (!(file in actual)) problems.push(`locked migration removed: ${file}`);
    else if (actual[file] !== sum)
      problems.push(`applied migration modified: ${file} (add a new migration instead)`);
  }
  for (const file of Object.keys(actual))
    if (!(file in lock)) problems.push(`migration not locked: ${file}`);
  if (problems.length) throw new Error(problems.join('\n'));
});

// ------------------------------------------------------ 3. static checks
step('format check', () => {
  const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  run('prettier', scripts['format:check'].split(/\s+/).slice(1));
});
step('lint', () => run('turbo', ['run', 'lint']));
step('typecheck', () => run('turbo', ['run', 'typecheck']));

// --------------------------------------------------------------- 4. tests
step('tests (PostgreSQL + Redis required)', () => {
  const missing = ['TEST_DATABASE_URL', 'REDIS_TEST_URL'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `${missing.join(', ')} not set: database/Redis suites would be skipped, so the gate cannot pass`,
    );
  }
  run('turbo', ['run', 'test', '--concurrency=1']);
});

// --------------------------------------------------------------- 5. build
step('production build', () => run('turbo', ['run', 'build']));

// ----------------------------------------------------------------- 6. e2e
if (e2e) {
  step('web E2E (Playwright)', () => {
    if (!process.env.E2E_DATABASE_URL) throw new Error('E2E_DATABASE_URL not set');
    run('playwright', ['test'], { cwd: path.join(root, 'apps/web') });
  });
}

console.log('\nRelease gate summary');
for (const [name, status, ms, detail] of results) {
  console.log(
    `${status}  ${name} (${(ms / 1000).toFixed(1)}s)${detail ? `\n      ${detail.split('\n').join('\n      ')}` : ''}`,
  );
}
const failed = results.some(([, status]) => status === 'FAIL');
console.log(`\nAUTOMATED RELEASE GATE: ${failed ? 'FAIL' : 'PASS'}`);
process.exitCode = failed ? 1 : 0;
