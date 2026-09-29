import { z } from 'zod';
import { controller, created, ok, type ApiModule } from '../../platform/http/route.js';
import { policies, rateLimit } from '../../platform/rate-limit.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './webhooks.service.js';

const endpointSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastDelivery: z.object({ status: z.string(), at: z.string() }).nullable(),
});
const withSecretSchema = z.object({
  endpoint: endpointSchema,
  /** Returned only here; it cannot be read again. */
  secret: z.string(),
});

const url = z.string().trim().min(1).max(2000);
const events = z.array(z.string().max(100)).min(1).max(50);
const description = z.string().trim().max(200);
const params = z.object({ id: z.uuid() });

const list = controller({
  handle: async ({ auth }) => ok(await service.list(actorFrom(auth))),
});

const eventTypes = controller({
  handle: async () => ok(service.eventTypes()),
});

const create = controller({
  body: z.object({ url, events, description: description.optional() }),
  handle: async ({ auth, body }) => created(await service.create(actorFrom(auth), body)),
});

const update = controller({
  params,
  body: z
    .object({
      url: url.optional(),
      events: events.optional(),
      description: description.nullable().optional(),
      active: z.boolean().optional(),
    })
    .refine((b) => Object.values(b).some((v) => v !== undefined), 'Nothing to update'),
  handle: async ({ auth, params, body }) =>
    ok(await service.update(actorFrom(auth), params.id, body)),
});

const rotate = controller({
  params,
  handle: async ({ auth, params }) => ok(await service.rotateSecret(actorFrom(auth), params.id)),
});

const remove = controller({
  params,
  handle: async ({ auth, params }) => {
    await service.remove(actorFrom(auth), params.id);
    return ok({ deleted: true });
  },
});

const tags = ['Webhooks'];
const permission = 'settings.integrations.manage' as const;
const limited = [rateLimit(policies.sensitive)];

export const webhooksModule: ApiModule = {
  name: 'webhooks',
  routes: [
    {
      method: 'get',
      path: '/webhooks',
      summary: 'Outbound webhook endpoints of the organization (secrets are never returned)',
      tags,
      permission,
      controller: list,
      response: z.array(endpointSchema),
    },
    {
      method: 'get',
      path: '/webhooks/event-types',
      summary: 'Event types an endpoint may subscribe to',
      tags,
      permission,
      controller: eventTypes,
      response: z.array(z.string()),
    },
    {
      method: 'post',
      path: '/webhooks',
      summary: 'Create an endpoint (HTTPS, public address); the signing secret is shown once',
      tags,
      permission,
      before: limited,
      controller: create,
      response: withSecretSchema,
      successStatus: 201,
    },
    {
      method: 'patch',
      path: '/webhooks/:id',
      summary: 'Update URL, description, subscribed events or enable/disable an endpoint',
      tags,
      permission,
      before: limited,
      controller: update,
      response: endpointSchema,
    },
    {
      method: 'post',
      path: '/webhooks/:id/rotate-secret',
      summary: 'Replace the signing secret (the new secret is shown once)',
      tags,
      permission,
      before: limited,
      controller: rotate,
      response: withSecretSchema,
    },
    {
      method: 'delete',
      path: '/webhooks/:id',
      summary: 'Delete an endpoint and its delivery log',
      tags,
      permission,
      before: limited,
      controller: remove,
      response: z.object({ deleted: z.literal(true) }),
    },
  ],
};
