import { createMemberSchema, EMAIL_PATTERN, updateProfileSchema } from '@crm/validation';
import { Router } from 'express';
import { z } from 'zod';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import * as settings from '../settings/settings.service.js';
import * as service from './organizations.service.js';

/**
 * DEPRECATED `/users` adapters → organizations.service (members of the
 * active organization) and settings.service (SMTP diagnostics). Legacy
 * bodies select roles by `roleId`/`role_id` (built-in 1/2/3) or `roleKey`.
 */

const createBody = createMemberSchema
  .omit({ roleKey: true })
  .extend({ roleKey: z.string().trim().min(1).max(50).optional(), roleId: z.unknown().optional() })
  .refine(
    (value) =>
      value.roleKey !== undefined ||
      (value.roleId !== undefined && value.roleId !== null && value.roleId !== ''),
    {
      message: 'All fields are required: full_name, email, password, roleId',
    },
  );

const updateBody = updateProfileSchema
  .extend({ roleKey: z.string().trim().min(1).max(50).optional(), role_id: z.unknown().optional() })
  .refine(
    (value) =>
      value.roleKey !== undefined ||
      (value.role_id !== undefined && value.role_id !== null && value.role_id !== ''),
    {
      message: 'All fields are required: full_name, email, username, role_id',
    },
  );

const testEmailBody = z.object({
  email: z.string().trim().regex(EMAIL_PATTERN, 'Email is required').optional(),
});

export function legacyUsersRouter(): Router {
  const router = Router();

  router.get(
    '/me',
    ...legacyRoute({
      handle: async ({ actor, req, res }) => {
        const auth = req.auth!;
        const member = await service.getMember(actor, actor.userId);
        res.status(200).json({
          success: true,
          user: {
            id: auth.userId,
            full_name: auth.name,
            email: auth.email,
            username: member.username,
            roleId: auth.legacyRoleId,
            role: { key: auth.roleKey, name: auth.roleName },
            is_active: true,
            organization: {
              id: auth.organizationPublicId,
              name: auth.organizationName,
              slug: auth.organizationSlug,
            },
            permissions: Object.fromEntries(auth.permissions),
          },
        });
      },
    }),
  );

  router.get(
    '/',
    ...legacyRoute({
      permission: 'settings.users.read',
      handle: async ({ actor, res }) => {
        res.status(200).json({ users: (await service.listMembers(actor, 'all')).items });
      },
    }),
  );

  router.post(
    '/',
    ...legacyRoute({
      permission: 'settings.users.manage',
      body: createBody,
      handle: async ({ actor, body, res }) => {
        const role = await service.resolveRole(actor, {
          roleKey: body.roleKey,
          legacyRoleId: body.roleId,
        });
        const { member, created } = await service.addMember(actor, { ...body, role });
        res.status(201).json({
          message: created ? 'User created successfully' : 'User invited to the organization',
          user: member,
        });
      },
    }),
  );

  router.put(
    '/:id',
    ...legacyRoute({
      permission: 'settings.users.manage',
      body: updateBody,
      handle: async ({ actor, body, req, res }) => {
        const userId = legacyId(req.params.id, 'User not found');
        const current = await service.getMember(actor, userId);
        const role = await service.resolveRole(actor, {
          roleKey: body.roleKey,
          legacyRoleId: body.role_id,
        });
        if (role.key !== current.role_key) await service.changeRole(actor, userId, role);
        const user = await service.updateProfile(actor, userId, {
          full_name: body.full_name,
          email: body.email,
          username: body.username,
        });
        res.status(200).json({ success: true, message: 'User updated successfully', user });
      },
    }),
  );

  router.patch(
    '/:id/status',
    ...legacyRoute({
      permission: 'settings.users.manage',
      handle: async ({ actor, req, res }) => {
        const user = await service.toggleStatus(actor, legacyId(req.params.id, 'User not found'));
        const activated = user.membership_status === 'active';
        res.status(200).json({
          success: true,
          message: `User ${activated ? 'activated' : 'deactivated'} successfully`,
          user,
        });
      },
    }),
  );

  router.post(
    '/verify-email',
    ...legacyRoute({
      permission: 'settings.organization.manage',
      handle: async ({ res }) => {
        const valid = await settings.verifyEmailConfiguration();
        res.status(valid ? 200 : 503).json({
          success: valid,
          message: valid ? 'Email configuration is valid' : 'Email configuration is invalid',
        });
      },
    }),
  );

  router.post(
    '/test-email',
    ...legacyRoute({
      permission: 'settings.organization.manage',
      body: testEmailBody,
      handle: async ({ actor, body, res }) => {
        const sent = await settings.sendTestEmail(actor, body.email);
        res.status(sent ? 200 : 503).json({
          success: sent,
          message: sent ? 'Test email sent successfully' : 'Failed to send test email',
        });
      },
    }),
  );

  return router;
}

/** DEPRECATED `GET /admin/dashboard`: an organization-administrator access probe. */
export function legacyAdminRouter(): Router {
  const router = Router();
  router.get(
    '/dashboard',
    ...legacyRoute({
      permission: 'settings.organization.manage',
      handle: async ({ res }) => {
        res.json({ message: 'Admin access granted' });
      },
    }),
  );
  return router;
}
