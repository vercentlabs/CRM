import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layering rules of the modular monolith (docs/architecture/API.md):
 * routes/controllers never touch SQL; services and repositories never touch
 * Express; no JavaScript backend sources remain; the pre-v1 compatibility
 * layer (removed in Phase 5) stays removed.
 */

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

const all = files(src);
const moduleFiles = all.filter(
  (f) =>
    f.includes(`${path.sep}modules${path.sep}`) && f.endsWith('.ts') && !f.endsWith('.test.ts'),
);
const rel = (f: string) => path.relative(src, f).split(path.sep).join('/');
const read = (f: string) => readFileSync(f, 'utf8');

const httpLayer = moduleFiles.filter((f) => /\.(controller|routes|webhooks)\.ts$/.test(f));
const domainLayer = moduleFiles.filter((f) => /\.(service|repository)\.ts$/.test(f));

describe('architecture', () => {
  it('finds the module layers', () => {
    expect(httpLayer.length).toBeGreaterThan(20);
    expect(domainLayer.length).toBeGreaterThan(20);
  });

  it('keeps SQL out of routes and controllers', () => {
    const offenders = httpLayer.filter((f) => {
      const text = read(f);
      return (
        /\bpool\.(query|connect)\b|\.query\(\s*[`'"]|platform\/db\.js|@crm\/database/.test(text) ||
        /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\s/.test(text)
      );
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('keeps Express out of services and repositories', () => {
    const offenders = domainLayer.filter((f) =>
      /from 'express'|\bres\.(status|json|send)\(|\breq\.(body|params|query)\b/.test(read(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('has no legacy compatibility layer (Phase 5)', () => {
    const legacyFiles = all.filter((f) =>
      /\.legacy\.ts$|legacy-response\.ts$|[\\/]http[\\/]legacy\.ts$/.test(f),
    );
    expect(legacyFiles.map(rel)).toEqual([]);
    const offenders = all.filter((f) =>
      /createLegacyRouter|legacyRoute\(|legacy[A-Z]\w*Router|'Deprecation'/.test(read(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('exposes no legacy numeric role id in DTOs or queries', () => {
    // Internal `roleId` names the membership's role row (roles.id); what is
    // gone is the legacy 1/2/3 alias (users.role_id, roles.legacy_role_id).
    const offenders = all
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) =>
        /legacy_role_id|legacyRoleId|sender_role_id|\busers\.role_id\b|\bu\.role_id\b|roleId: subject|z\.object\(\{[^}]*\brole_id\b/.test(
          read(f),
        ),
      );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('never authorizes by numeric role id', () => {
    const offenders = all
      .filter((f) => f.endsWith('.ts'))
      .filter((f) =>
        /role_?[iI]d\s*(===|!==|==|!=|<=|>=|<|>)\s*\d|legacyRoleId\s*(===|!==|==|!=)\s*\d|LEGACY_ROLE_IDS\.\w+\s*(===|!==)/.test(
          read(f),
        ),
      );
    expect(offenders.map(rel)).toEqual([]);
  });

  it('reads the tenant only from the verified session', () => {
    const offenders = moduleFiles.filter((f) =>
      /(body|query|params)\.(organization_?[iI]d|org)\b/.test(read(f)),
    );
    // Public organization ids appear only where the user names an organization they belong to.
    const allowed = [
      'modules/auth/auth.routes.ts',
      'modules/organizations/organizations.routes.ts',
    ];
    expect(offenders.map(rel).filter((f) => !allowed.includes(f))).toEqual([]);
  });

  it('has no JavaScript backend sources left', () => {
    expect(all.filter((f) => /\.(js|cjs|mjs)$/.test(f)).map(rel)).toEqual([]);
  });

  it('has one authorization middleware', () => {
    expect(all.some((f) => /middleware[\\/]auth\.middleware/.test(f))).toBe(false);
    const imports = all.filter((f) => /from '.*auth\.middleware/.test(read(f)));
    expect(imports.map(rel)).toEqual([]);
  });

  describe('runtime platform (Phase 6)', () => {
    const sources = all.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    it('publishes domain events only through the approved transactional mechanism', () => {
      // Services call platform/events.ts `emit(tx, …)`; appendEvent directly only for the
      // platform (organization-less) password-reset event.
      const direct = sources.filter((f) => /\bappendEvent\(/.test(read(f))).map(rel);
      expect(direct.sort()).toEqual(['modules/auth/password.service.ts', 'platform/events.ts']);
      // Never with the pool: the event must share the domain change's transaction.
      expect(sources.filter((f) => /\bemit\(\s*pool\b/.test(read(f))).map(rel)).toEqual([]);
    });

    it('keeps queue internals and provider SDKs out of the API domain', () => {
      expect(sources.filter((f) => /from '(bullmq|ioredis)'/.test(read(f))).map(rel)).toEqual([]);
      const sdk = sources.filter((f) => /from '(imagekit|nodemailer)'/.test(read(f))).map(rel);
      expect(sdk).toEqual([]);
      const plivo = sources
        .filter((f) => /from 'plivo'/.test(read(f)))
        .map(rel)
        .sort();
      expect(plivo).toEqual(['integrations/plivo.ts', 'platform/plivo-signature.ts']);
    });

    it('never checks plan names (entitlements are resolved through @crm/entitlements)', () => {
      const offenders = sources.filter((f) =>
        /plan(\.key|Key|_key)?\s*[!=]==\s*['"]|['"](base|free|premium|pro|enterprise)['"]\s*[!=]==\s*\w*plan/i.test(
          read(f),
        ),
      );
      expect(offenders.map(rel)).toEqual([]);
    });
  });
});
