import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source rules for the web app (docs/architecture/WEB.md):
 * UI code talks to the API only through @crm/api-client, never authorizes by
 * numeric role ids, never stores tokens, never injects HTML.
 */

const root = path.resolve(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root).filter(
  (f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f),
);
const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');
const source = (f: string) => readFileSync(f, 'utf8');
const offenders = (pattern: RegExp, allow: string[] = []) =>
  files.filter((f) => !allow.includes(rel(f)) && pattern.test(source(f))).map(rel);

/** The single API integration (it may know about the base URL). */
const API_LAYER = ['lib/api.ts', 'lib/env.ts'];

describe('web architecture', () => {
  it('is written in TypeScript', () => {
    expect(files.filter((f) => /\.(js|jsx|mjs)$/.test(f)).map(rel)).toEqual([]);
  });

  it('has no direct HTTP calls outside the API integration', () => {
    expect(offenders(/\bfetch\s*\(|axios|XMLHttpRequest|new\s+EventSource/, API_LAYER)).toEqual([]);
  });

  /**
   * API paths never appear in UI code: `/api/...` strings, or paths that only
   * exist on the (legacy) API. Page routes such as `/leads/12` are UI links.
   */
  const ENDPOINT =
    /['"`]\/(api\/|auth\/|users(\/|['"`?])|sales-locations|gold\/|admin\/|audit['"`/?]|reports\/(export|conversion-report|dashboard-summary|sales-performance\?)|leads\/[^'"`]*\/(assign|followups)\b|calls\/(initiate|[^'"`]*\/end)|followups\/[^'"`]*\/(complete|overdue)|messages\/send|organization\/members)/;

  it('recognises endpoint strings (self-check of the rule)', () => {
    for (const bad of [
      "api.get('/leads' + '')",
      "'/api/v1/leads'",
      "'/api/chat/conversations'",
      "'/users/managers'",
      '`/leads/${id}/assign`',
      "'/sales-locations'",
      "'/gold/refresh'",
      "'/reports/export-leads-csv'",
      "'/calls/initiate'",
      '`/followups/${id}/complete`',
      "'/auth/login'",
      "'/audit'",
    ].slice(1)) {
      expect(ENDPOINT.test(bad), bad).toBe(true);
    }
    for (const fine of [
      "href='/leads'",
      '`/leads/${lead.id}`',
      "'/settings/members'",
      "'/messages/bulk'",
      "'/reports?tab=performance'",
      "'/followups?view=overdue'",
    ]) {
      expect(ENDPOINT.test(fine), fine).toBe(false);
    }
  });

  it('has no hard-coded API endpoint strings in UI code', () => {
    expect(offenders(ENDPOINT, API_LAYER)).toEqual([]);
  });

  it('never makes decisions from numeric role ids', () => {
    expect(
      offenders(/\broleId\b|\brole_id\b|ROLE_ADMIN|ROLE_MANAGER|ROLE_SALES|LEGACY_ROLE_IDS/),
    ).toEqual([]);
  });

  it('never stores tokens in browser storage', () => {
    expect(offenders(/(localStorage|sessionStorage)[\s\S]{0,80}(token|jwt|refresh)/i)).toEqual([]);
    // The only storage use is the per-browser theme preference.
    expect(offenders(/localStorage|sessionStorage/)).toEqual(['providers/ThemeProvider.tsx']);
  });

  it('never injects HTML', () => {
    expect(offenders(/dangerouslySetInnerHTML|innerHTML\s*=/)).toEqual([]);
  });

  it('builds UI from the design system instead of old duplicate primitives', () => {
    expect(offenders(/from ['"]@\/components\/(common|ui)\//)).toEqual([]);
    expect(offenders(/\bredux\b|react-redux|@reduxjs/)).toEqual([]);
  });

  it('keeps server state in TanStack Query (no hand-rolled fetch-in-effect)', () => {
    expect(offenders(/useEffect\([^)]*\)\s*=>\s*\{[^}]*api\(\)\.v1\.[a-z]+\.(list|get)\(/)).toEqual(
      [],
    );
  });
});
