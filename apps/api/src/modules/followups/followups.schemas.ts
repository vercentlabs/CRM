import { FOLLOWUP_TYPES } from '@crm/validation';
import { z } from 'zod';

export const followupSchema = z.object({
  id: z.number(),
  lead_id: z.number(),
  assigned_to: z.number(),
  followup_date: z.string(),
  followup_type: z.enum(FOLLOWUP_TYPES),
  notes: z.string().nullable(),
  status: z.enum(['Pending', 'Completed', 'Cancelled']),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const scheduleItemSchema = z.object({
  lead_id: z.number(),
  lead_name: z.string(),
  lead_email: z.string().nullable(),
  lead_mobile: z.string(),
  lead_status: z.string(),
  next_call_at: z.string(),
  assigned_to: z.number().nullable(),
  assigned_to_name: z.string().nullable(),
  overdue: z.boolean(),
});
