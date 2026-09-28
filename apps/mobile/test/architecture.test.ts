/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Architecture guardrails for the mobile app (see docs/architecture/MOBILE.md).
 * These scan source text, so they fail the moment a forbidden pattern returns.
 */
const ROOT = join(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name: string) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

const sources = [...files(join(ROOT, 'src')), join(ROOT, 'App.tsx'), join(ROOT, 'index.ts')].map(
  (path) => ({
    path: relative(ROOT, path).replace(/\\/g, '/'),
    text: readFileSync(path, 'utf8'),
  }),
);

const offenders = (pattern: RegExp, allow: (path: string) => boolean = () => false) =>
  sources.filter((f) => !allow(f.path) && pattern.test(f.text)).map((f) => f.path);

describe('mobile architecture', () => {
  test('source files were found', () => {
    expect(sources.length).toBeGreaterThan(40);
  });

  test('no legacy (unversioned) API endpoints', () => {
    const legacy =
      /['"`]\/(api\/lead-messages|api\/chat|users(\/|['"`])|sales-locations|gold\/|reports\/export-|followups\/overdue|calls\/initiate|auth\/login['"`])/;
    expect(offenders(legacy)).toEqual([]);
  });

  test('no raw fetch or axios calls to the CRM API (only @crm/api-client)', () => {
    expect(offenders(/\baxios\b/)).toEqual([]);
    expect(offenders(/\bfetch\s*\(/)).toEqual([]);
    expect(offenders(/XMLHttpRequest/)).toEqual([]);
  });

  test('only lib/api.ts creates the API client', () => {
    expect(offenders(/createApiClient\(/, (p) => p === 'src/lib/api.ts')).toEqual([]);
  });

  test('no numeric role authorization', () => {
    expect(offenders(/\broleId\b|\brole_id\b|\bsender_role_id\b/)).toEqual([]);
    expect(offenders(/role\s*===\s*\d|roleId\s*[=!]==/)).toEqual([]);
  });

  test('tokens never touch AsyncStorage or other persistence', () => {
    const asyncStorageUsers = offenders(/@react-native-async-storage\/async-storage/);
    expect(asyncStorageUsers).toEqual(['src/theme/ThemeProvider.tsx']);
    expect(offenders(/expo-secure-store/, (p) => p === 'src/lib/tokens.ts')).toEqual([]);
    for (const f of sources.filter((s) => s.text.includes('@react-native-async-storage'))) {
      // Only the theme preference is stored there; no write may involve auth data.
      expect(f.text).not.toMatch(
        /AsyncStorage\.(setItem|multiSet|mergeItem)\([^)]*(token|session|refresh|auth)/i,
      );
      expect(f.text).not.toMatch(/from '\.\.\/lib\/(tokens|api)'/);
    }
    expect(offenders(/redux-persist|expo-file-system/)).toEqual([]);
  });

  test('no calls to endpoints that do not exist (AI, Google integration)', () => {
    expect(offenders(/['"`]\/ai\//)).toEqual([]);
    expect(offenders(/integrations\/google/)).toEqual([]);
    expect(offenders(/coming soon/i)).toEqual([]);
  });

  test('server state is organization-scoped', () => {
    // Query keys come from useQueryKey (['org', orgId, ...]); no hand-built keys.
    expect(offenders(/queryKey:\s*\[/)).toEqual([]);
  });

  test('no tokens are logged', () => {
    expect(offenders(/console\.(log|info|debug|warn)\([^)]*(token|password)/i)).toEqual([]);
  });
});
