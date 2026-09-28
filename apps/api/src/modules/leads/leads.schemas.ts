import { LEAD_STATUSES } from '@crm/validation';
import { z } from 'zod';
import { optionalDate, optionalId, pageQuery, sortQuery } from '../../platform/http/query.js';
import { LEAD_SORTS } from './leads.repository.js';

export {
  assignmentSchema,
  createFollowupSchema,
  createLeadSchema,
  updateLeadSchema,
} from '@crm/validation';

export const listLeadsQuery = z.object({
  ...pageQuery,
  status: z.enum(LEAD_STATUSES).optional(),
  assigned_to: optionalId,
  date_from: optionalDate,
  date_to: optionalDate,
  search: z.string().trim().min(1).max(100).optional(),
  sort: sortQuery(LEAD_SORTS, '-created_at'),
});

export const leadIdParams = z.object({ id: z.coerce.number().int().positive() });

/** Wire shape of a lead (documentation). */
export const leadSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  mobile_number: z.string(),
  alternate_number: z.string().nullable(),
  email: z.string().nullable(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  age: z.number().nullable(),
  address: z.string().nullable(),
  occupation: z.string().nullable(),
  monthly_income: z.string().nullable(),
  is_aware_of_digital_gold: z.boolean(),
  status: z.enum(LEAD_STATUSES),
  next_call_at: z.string().nullable(),
  created_by: z.number().nullable(),
  assigned_to: z.number().nullable(),
  location_id: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  assigned_user_name: z.string().nullable(),
  location_name: z.string().nullable(),
});
