import { toFieldIssues } from '@crm/validation';
import { Router } from 'express';
import { z } from 'zod';
import pool from '../../config/db.js';
import { recordAuditEvent } from '../audit.js';
import { authenticate, requirePermission } from '../auth/middleware.js';
import { listMemberships } from '../auth/repository.js';
import { AppError } from '../http/errors.js';
import { sendData } from '../http/respond.js';
import { parseId } from '../tenancy.js';
import {
  changeMemberRole,
  getMember,
  listAssignableRoles,
  listMembers,
  resolveAssignableRole,
  setMemberStatus,
} from './members.js';

const memberUpdateSchema = z
  .object({
    roleKey: z.string().min(1).max(50).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((value) => value.roleKey !== undefined || value.status !== undefined, {
    message: 'Provide roleKey and/or status',
  });

/** `/api/v1/organizations`: the caller's organizations (multi-org users). */
export function createOrganizationsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', async (req, res) => {
    const memberships = await listMemberships(req.auth!.userId);
    sendData(
      res,
      memberships
        .filter((m) => m.status !== 'suspended' && m.organizationStatus === 'active')
        .map((m) => ({
          organization: {
            id: m.organizationPublicId,
            name: m.organizationName,
            slug: m.organizationSlug,
          },
          role: { key: m.roleKey, name: m.roleName },
          status: m.status,
          current: m.organizationId === req.auth!.organizationId,
        })),
    );
  });

  router.post('/:organizationId/accept-invitation', async (req, res) => {
    const result = await pool.query(
      `UPDATE organization_memberships m SET status = 'active', joined_at = now()
       FROM organizations o
       WHERE o.id = m.organization_id AND o.public_id::text = $1 AND o.status = 'active'
         AND m.user_id = $2 AND m.status = 'invited'
       RETURNING m.organization_id`,
      [req.params.organizationId, req.auth!.userId],
    );
    if (result.rows.length === 0) throw AppError.notFound('Invitation not found');
    await recordAuditEvent({
      organizationId: result.rows[0].organization_id,
      action: 'INVITATION_ACCEPTED',
      tableName: 'organization_memberships',
      recordId: req.auth!.userId,
    });
    sendData(res, { accepted: true });
  });

  return router;
}

/** `/api/v1/organization`: the active organization of the session. */
export function createCurrentOrganizationRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.get('/', async (req, res) => {
    const auth = req.auth!;
    sendData(res, {
      id: auth.organizationPublicId,
      name: auth.organizationName,
      slug: auth.organizationSlug,
      membership: { id: auth.membershipId, role: { key: auth.roleKey, name: auth.roleName } },
    });
  });

  router.get('/members', requirePermission('settings.users.read'), async (req, res) => {
    sendData(res, await listMembers(req.auth!.organizationId));
  });

  router.get('/roles', requirePermission('settings.users.read'), async (req, res) => {
    sendData(res, await listAssignableRoles(req.auth!.organizationId));
  });

  router.patch('/members/:userId', requirePermission('settings.users.manage'), async (req, res) => {
    const userId = parseId(req.params.userId);
    if (userId === null) throw AppError.notFound('User not found');
    const parsed = memberUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw AppError.validation(toFieldIssues(parsed.error));

    if (parsed.data.roleKey !== undefined) {
      const role = await resolveAssignableRole(req.auth!.organizationId, {
        roleKey: parsed.data.roleKey,
      });
      if (!role) throw AppError.validation([{ field: 'roleKey', message: 'Unknown role' }]);
      await changeMemberRole(req.auth!, userId, role);
    }
    if (parsed.data.status !== undefined) {
      await setMemberStatus(req.auth!, userId, parsed.data.status);
    }
    const member = await getMember(req.auth!.organizationId, userId);
    if (!member) throw AppError.notFound('User not found');
    sendData(res, member);
  });

  return router;
}
