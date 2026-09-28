import { ERROR_CODES } from '@crm/types';
import { z } from 'zod';
import type { ApiModule, RouteDefinition } from './route.js';

/**
 * Builds the OpenAPI 3.1 document from the route registry: request schemas
 * come from each route's Zod params/query/body, response schemas from its
 * documented `response`. No separate hand-written spec to drift.
 */

type Json = Record<string, unknown>;

/**
 * Shared definitions hoisted out of embedded schemas (Zod emits local
 * `#/$defs/...` refs for recursive types such as JSON values), keyed by
 * their new name under components.schemas. Reset per document build.
 */
let hoisted: Record<string, Json> = {};

function rewriteRefs(value: unknown, renames: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteRefs(item, renames));
  if (value === null || typeof value !== 'object') return value;
  const result: Json = {};
  for (const [key, child] of Object.entries(value as Json)) {
    result[key] =
      key === '$ref' && typeof child === 'string' && renames.has(child)
        ? renames.get(child)
        : rewriteRefs(child, renames);
  }
  return result;
}

function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): Json {
  let json: Json;
  try {
    json = z.toJSONSchema(schema, { io, unrepresentable: 'any', target: 'draft-2020-12' }) as Json;
  } catch {
    return {};
  }
  delete json.$schema;
  const defs = json.$defs as Record<string, Json> | undefined;
  if (!defs) return json;
  delete json.$defs;
  const renames = new Map<string, string>();
  for (const name of Object.keys(defs)) {
    const target = `Def${Object.keys(hoisted).length + renames.size + 1}`;
    renames.set(`#/$defs/${name}`, `#/components/schemas/${target}`);
  }
  for (const [name, def] of Object.entries(defs)) {
    const target = renames.get(`#/$defs/${name}`)!.split('/').pop()!;
    hoisted[target] = rewriteRefs(def, renames) as Json;
  }
  return rewriteRefs(json, renames) as Json;
}

const errorEnvelope: Json = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { const: false },
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', enum: [...ERROR_CODES] },
        message: { type: 'string' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            properties: { field: { type: 'string' }, message: { type: 'string' } },
          },
        },
        requestId: { type: 'string' },
      },
    },
  },
};

const paginationSchema: Json = {
  type: 'object',
  required: ['page', 'limit', 'total', 'totalPages'],
  properties: {
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
};

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

/** `/leads/:id` → `/leads/{id}` */
export const toOpenApiPath = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

function parameters(route: RouteDefinition): Json[] {
  const result: Json[] = [];
  const add = (schema: z.ZodType | undefined, location: 'path' | 'query') => {
    if (!schema) return;
    const json = toJsonSchema(schema, 'input');
    const properties = (json.properties ?? {}) as Record<string, Json>;
    const required = new Set((json.required ?? []) as string[]);
    for (const [name, property] of Object.entries(properties)) {
      result.push({
        name,
        in: location,
        required: location === 'path' || required.has(name),
        schema: property,
      });
    }
  };
  add(route.controller.params, 'path');
  add(route.controller.query, 'query');
  // Path parameters not declared by a schema are still documented.
  for (const match of route.path.matchAll(/:([A-Za-z0-9_]+)/g)) {
    if (!result.some((p) => p.in === 'path' && p.name === match[1])) {
      result.push({ name: match[1], in: 'path', required: true, schema: { type: 'string' } });
    }
  }
  return result;
}

function successResponse(route: RouteDefinition): Json {
  if (route.produces) {
    return {
      description: 'Success',
      content: { [route.produces]: { schema: { type: 'string' } } },
    };
  }
  const envelope: Json = {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { const: true },
      data: route.response ? toJsonSchema(route.response, 'output') : {},
      ...(route.paginated
        ? {
            meta: {
              type: 'object',
              required: ['pagination'],
              properties: { pagination: { $ref: '#/components/schemas/Pagination' } },
            },
          }
        : {}),
    },
  };
  return { description: 'Success', content: { 'application/json': { schema: envelope } } };
}

function operation(route: RouteDefinition, moduleName: string): Json {
  const isPublic = route.auth === 'public';
  const responses: Json = {
    [String(route.successStatus ?? 200)]: successResponse(route),
    400: errorResponse('Validation failed'),
    ...(isPublic ? {} : { 401: errorResponse('Not authenticated') }),
    ...(isPublic ? {} : { 403: errorResponse('Not permitted') }),
    ...(route.path.includes(':')
      ? { 404: errorResponse('Not found (includes records of other organizations)') }
      : {}),
    500: errorResponse('Internal error (no details)'),
  };
  const op: Json = {
    operationId: `${moduleName}.${route.method}${toOpenApiPath(route.path)
      .replace(/[{}]/g, '')
      .replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))}`,
    summary: route.summary,
    tags: route.tags,
    parameters: parameters(route),
    responses,
    security: isPublic ? [] : [{ bearerAuth: [] }, { cookieAuth: [] }],
    ...(route.permission ? { 'x-permission': route.permission } : {}),
    ...(route.scope ? { 'x-required-scope': route.scope } : {}),
  };
  if (route.consumes) {
    op.requestBody = {
      required: true,
      content: {
        [route.consumes]: {
          schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
        },
      },
    };
  } else if (route.controller.body) {
    op.requestBody = {
      required: true,
      content: { 'application/json': { schema: toJsonSchema(route.controller.body, 'input') } },
    };
  }
  return op;
}

export function buildOpenApiDocument(
  modules: ApiModule[],
  info: { title: string; version: string; serverUrl: string },
): Json {
  hoisted = {};
  const paths: Record<string, Json> = {
    '/health/live': {
      get: {
        operationId: 'health.live',
        summary: 'Liveness',
        tags: ['Health'],
        security: [],
        responses: { 200: { description: 'Process is up' } },
      },
    },
    '/health/ready': {
      get: {
        operationId: 'health.ready',
        summary: 'Readiness (database reachable, not draining)',
        tags: ['Health'],
        security: [],
        responses: { 200: { description: 'Ready' }, 503: { description: 'Not ready' } },
      },
    },
  };
  for (const mod of modules) {
    for (const route of mod.routes) {
      const path = toOpenApiPath(route.path);
      paths[path] = { ...(paths[path] ?? {}), [route.method]: operation(route, mod.name) };
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: info.title,
      version: info.version,
      description:
        'Multi-tenant CRM API. The organization is always taken from the authenticated session; record ids of other organizations answer 404.',
    },
    servers: [{ url: info.serverUrl }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Mobile/API clients',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'crm_at',
          description: 'Web clients; unsafe methods also require the x-csrf-token header',
        },
      },
      schemas: { Error: errorEnvelope, Pagination: paginationSchema, ...hoisted },
    },
  };
}
