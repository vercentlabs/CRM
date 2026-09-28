import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../../platform/auth/middleware.js';
import {
  getGoldRate,
  GoldRateUnavailableError,
  type GoldRate,
} from '../../integrations/gold-rate.js';
import { AppError } from '../../platform/http/errors.js';
import { controller, ok, type ApiModule } from '../../platform/http/route.js';

/** Market data widget (platform-wide gold quote; no tenant data). */

async function rate(forceRefresh: boolean): Promise<GoldRate> {
  try {
    return await getGoldRate({ forceRefresh });
  } catch (error) {
    if (error instanceof GoldRateUnavailableError) throw AppError.serviceUnavailable(error.message);
    throw error;
  }
}

const weights = z.object({
  '1g': z.number(),
  '5g': z.number(),
  '10g': z.number(),
  '50g': z.number(),
  '100g': z.number(),
});
const goldRateSchema = z.object({
  updated_at: z.string(),
  gold_22k: weights,
  gold_24k: weights,
  source: z.enum(['live', 'cache']),
  warning: z.union([z.literal(false), z.string()]),
  cacheAge: z.number().optional(),
  isExpired: z.boolean().optional(),
});

export const marketModule: ApiModule = {
  name: 'market',
  routes: [
    {
      method: 'get',
      path: '/market/gold-rate',
      summary: 'Current gold rate (cached 5 minutes)',
      tags: ['Market'],
      controller: controller({ handle: async () => ok(await rate(false)) }),
      response: goldRateSchema,
    },
    {
      method: 'post',
      path: '/market/gold-rate/refresh',
      summary: 'Force a gold rate refresh',
      tags: ['Market'],
      permission: 'settings.organization.manage',
      controller: controller({ handle: async () => ok(await rate(true)) }),
      response: goldRateSchema,
    },
  ],
};

/** DEPRECATED `/gold-rate` and `/gold/refresh` (mounted at `/gold`). */
export function legacyGoldRouter(): Router {
  const router = Router();
  const respond = async (forceRefresh: boolean, res: import('express').Response) => {
    try {
      const data = await getGoldRate({ forceRefresh });
      res.setHeader('Deprecation', 'true');
      if (forceRefresh)
        res.status(200).json({ message: 'Gold rates refreshed successfully', data });
      else res.status(200).json(data);
    } catch (error) {
      if (!(error instanceof GoldRateUnavailableError)) throw error;
      res.status(503).json({ message: error.message, source: 'none', warning: true });
    }
  };
  router.get('/gold-rate', authenticate, (_req, res) => respond(false, res));
  router.post(
    '/gold/refresh',
    authenticate,
    requirePermission('settings.organization.manage'),
    (_req, res) => respond(true, res),
  );
  return router;
}
