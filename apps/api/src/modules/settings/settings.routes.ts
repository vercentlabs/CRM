import { EMAIL_PATTERN, updateSettingsSchema } from '@crm/validation';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../platform/http/errors.js';
import { legacyRoute } from '../../platform/http/legacy.js';
import { sendSuccess } from '../../platform/http/legacy-response.js';
import { controller, ok, type ApiModule } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './settings.service.js';

const settingsSchema = z.record(z.string(), z.string());
const testEmailBody = z.object({
  email: z.string().trim().regex(EMAIL_PATTERN, 'Email is required').optional(),
});

const get = controller({
  handle: async ({ auth }) => ok(await service.getSettings(actorFrom(auth))),
});

const update = controller({
  body: updateSettingsSchema,
  handle: async ({ auth, body }) =>
    ok(await service.updateSettings(actorFrom(auth), body.settings)),
});

const verifyEmail = controller({
  handle: async () => {
    if (!(await service.verifyEmailConfiguration()))
      throw AppError.serviceUnavailable('Email configuration is invalid');
    return ok({ valid: true });
  },
});

const testEmail = controller({
  body: testEmailBody,
  handle: async ({ auth, body }) => {
    if (!(await service.sendTestEmail(actorFrom(auth), body.email)))
      throw AppError.serviceUnavailable('Failed to send test email');
    return ok({ sent: true });
  },
});

const tags = ['Settings'];
const permission = 'settings.organization.manage' as const;

export const settingsModule: ApiModule = {
  name: 'settings',
  routes: [
    {
      method: 'get',
      path: '/settings',
      summary: 'Organization settings',
      tags,
      permission,
      controller: get,
      response: settingsSchema,
    },
    {
      method: 'patch',
      path: '/settings',
      summary: 'Update organization settings (atomic)',
      tags,
      permission,
      controller: update,
      response: settingsSchema,
    },
    {
      method: 'post',
      path: '/settings/email/verify',
      summary: 'Check the server SMTP configuration (no details)',
      tags,
      permission,
      controller: verifyEmail,
      response: z.object({ valid: z.literal(true) }),
    },
    {
      method: 'post',
      path: '/settings/email/test',
      summary: 'Send a test email (defaults to my address)',
      tags,
      permission,
      controller: testEmail,
      response: z.object({ sent: z.literal(true) }),
    },
  ],
};

/** DEPRECATED `/settings` adapters → settings.service. */
export function legacySettingsRouter(): Router {
  const router = Router();
  router.get(
    '/',
    ...legacyRoute({
      permission,
      handle: async ({ actor, res }) => {
        sendSuccess(res, 'Settings retrieved successfully', {
          settings: await service.getSettings(actor),
        });
      },
    }),
  );
  router.patch(
    '/',
    ...legacyRoute({
      permission,
      body: updateSettingsSchema,
      handle: async ({ actor, body, res }) => {
        sendSuccess(res, 'Settings updated successfully', {
          settings: await service.updateSettings(actor, body.settings),
        });
      },
    }),
  );
  return router;
}
