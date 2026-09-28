import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';
import { apiModules } from '../src/modules/index.js';
import { buildOpenApiDocument, toOpenApiPath } from '../src/platform/http/openapi.js';

type Doc = {
  openapi: string;
  paths: Record<
    string,
    Record<string, { operationId: string; security: unknown[]; requestBody?: unknown }>
  >;
};

const doc = buildOpenApiDocument(apiModules, {
  title: 'CRM API',
  version: '1.0.0',
  serverUrl: '/api/v1',
}) as unknown as Doc;

describe('OpenAPI document', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const validator = new Validator();
    const result = await validator.validate(doc as unknown as Parameters<Validator['validate']>[0]);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
    expect(doc.openapi).toBe('3.1.0');
  });

  it('documents every registered v1 route exactly once', () => {
    const registered = apiModules.flatMap((m) =>
      m.routes.map((r) => `${r.method.toUpperCase()} ${toOpenApiPath(r.path)}`),
    );
    expect(new Set(registered).size).toBe(registered.length);
    const documented = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`),
    );
    for (const route of registered) expect(documented).toContain(route);
    const operationIds = Object.values(doc.paths).flatMap((ops) =>
      Object.values(ops).map((op) => op.operationId),
    );
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it('documents request bodies for every route that validates one', () => {
    for (const mod of apiModules) {
      for (const route of mod.routes) {
        if (!route.controller.body && !route.consumes) continue;
        expect(
          doc.paths[toOpenApiPath(route.path)]![route.method]!.requestBody,
          `${route.method} ${route.path}`,
        ).toBeDefined();
      }
    }
  });

  it('requires authentication except on public auth routes', () => {
    for (const mod of apiModules) {
      for (const route of mod.routes) {
        const op = doc.paths[toOpenApiPath(route.path)]![route.method]!;
        if (route.auth === 'public') {
          expect(route.path.startsWith('/auth/'), route.path).toBe(true);
          expect(op.security).toEqual([]);
        } else {
          expect(op.security.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never exposes internal identifiers or secrets', () => {
    const text = JSON.stringify(doc);
    expect(text).not.toMatch(/organization_id|password_hash|token_hash|JWT_SECRET/);
  });
});
