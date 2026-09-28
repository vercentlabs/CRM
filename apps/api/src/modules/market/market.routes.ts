import { z } from 'zod';
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
