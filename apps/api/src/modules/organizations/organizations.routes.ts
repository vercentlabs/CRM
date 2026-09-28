import { createMemberSchema, updateMemberSchema, updateProfileSchema } from '@crm/validation';
import { z } from 'zod';
import { offsetOf, pageQuery } from '../../platform/http/query.js';
import {
  controller,
  created,
  ok,
  paginationMeta,
  type ApiModule,
} from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './organizations.service.js';

const userParams = z.object({ userId: z.coerce.number().int().positive() });
const organizationParams = z.object({ organizationId: z.uuid() });

export const memberSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  email: z.string(),
  username: z.string(),
  role_id: z.number().nullable(),
  role_key: z.string(),
  role_name: z.string(),
  membership_id: z.number(),
  membership_status: z.enum(['active', 'invited', 'suspended']),
  is_active: z.boolean(),
});

const organizationSummary = z.object({ id: z.uuid(), name: z.string(), slug: z.string() });
const roleSummary = z.object({ key: z.string(), name: z.string() });

const myOrganizations = controller({
  handle: async ({ auth }) => ok(await service.myOrganizations(actorFrom(auth))),
});

const acceptInvitation = controller({
  params: organizationParams,
  handle: async ({ auth, params }) => {
    await service.acceptInvitation(auth.userId, params.organizationId);
    return ok({ accepted: true });
  },
});

const current = controller({
  handle: async ({ auth }) =>
    ok({
      id: auth.organizationPublicId,
      name: auth.organizationName,
      slug: auth.organizationSlug,
      membership: { id: auth.membershipId, role: { key: auth.roleKey, name: auth.roleName } },
    }),
});

const listMembers = controller({
  query: z.object(pageQuery),
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listMembers(actorFrom(auth), {
      limit: query.limit,
      offset: offsetOf(query),
    });
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

const listRoles = controller({
  handle: async ({ auth }) => ok(await service.listRoles(actorFrom(auth))),
});

const addMember = controller({
  body: createMemberSchema,
  handle: async ({ auth, body }) => {
    const actor = actorFrom(auth);
    const role = await service.resolveRole(actor, { roleKey: body.roleKey });
    const { member } = await service.addMember(actor, { ...body, role });
    return created(member);
  },
});

const updateMember = controller({
  params: userParams,
  body: updateMemberSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.updateMember(actorFrom(auth), params.userId, body)),
});

const updateProfile = controller({
  params: userParams,
  body: updateProfileSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.updateProfile(actorFrom(auth), params.userId, body)),
});

const tags = ['Organizations'];

export const organizationsModule: ApiModule = {
  name: 'organizations',
  routes: [
    {
      method: 'get',
      path: '/organizations',
      summary: 'Organizations I belong to or am invited to',
      tags,
      controller: myOrganizations,
      response: z
        .object({
          organization: organizationSummary,
          role: roleSummary,
          status: z.enum(['active', 'invited']),
          current: z.boolean(),
        })
        .array(),
    },
    {
      method: 'post',
      path: '/organizations/:organizationId/accept-invitation',
      summary: 'Accept an invitation',
      tags,
      controller: acceptInvitation,
      response: z.object({ accepted: z.literal(true) }),
    },
    {
      method: 'get',
      path: '/organization',
      summary: 'The active organization of this session',
      tags,
      controller: current,
      response: organizationSummary.extend({
        membership: z.object({ id: z.number(), role: roleSummary }),
      }),
    },
    {
      method: 'get',
      path: '/organization/members',
      summary: 'Members of the active organization',
      tags,
      permission: 'settings.users.read',
      controller: listMembers,
      response: memberSchema.array(),
      paginated: true,
    },
    {
      method: 'get',
      path: '/organization/roles',
      summary: 'Roles assignable in the active organization',
      tags,
      permission: 'settings.users.read',
      controller: listRoles,
      response: z
        .object({
          key: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          is_system: z.boolean(),
          permissions: z.record(z.string(), z.enum(['own', 'organization'])),
        })
        .array(),
    },
    {
      method: 'post',
      path: '/organization/members',
      summary: 'Add a member (existing identities are invited)',
      tags,
      permission: 'settings.users.manage',
      controller: addMember,
      response: memberSchema,
      successStatus: 201,
    },
    {
      method: 'patch',
      path: '/organization/members/:userId',
      summary: "Change a member's role and/or status",
      tags,
      permission: 'settings.users.manage',
      controller: updateMember,
      response: memberSchema,
    },
    {
      method: 'put',
      path: '/organization/members/:userId/profile',
      summary: "Update a member's identity (self, or members of this organization only)",
      tags,
      permission: 'settings.users.manage',
      controller: updateProfile,
      response: memberSchema,
    },
  ],
};
