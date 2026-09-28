import { z } from 'zod';
import { EMAIL_PATTERN } from '../common.js';
import { passwordSchema } from '../auth.js';
import {
  booleanLike,
  dateLike,
  nonEmptyPatch,
  nullableDate,
  nullableId,
  nullableNumber,
  nullableText,
  optionalEmail,
  requiredId,
  tenDigitPhone,
} from './primitives.js';

/*
 * Request schemas for the CRM API (snake_case wire format, matching the
 * historical API and the database columns). Unknown keys are stripped, so
 * fields such as `organization_id` can never reach the API services.
 */

// ---------------------------------------------------------------- leads
export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'] as const;
export const LEAD_SOURCES = [
  'website',
  'referral',
  'social_media',
  'email_campaign',
  'cold_call',
  'event',
  'other',
] as const;

const leadStatus = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.enum(LEAD_STATUSES, {
    error: 'Status must be one of: New, Contacted, Qualified, Converted, Lost',
  }),
);
const leadSource = z.preprocess(
  (value) => (value === '' ? null : value),
  z
    .enum(LEAD_SOURCES, {
      error:
        'Source must be one of: website, referral, social_media, email_campaign, cold_call, event, other',
    })
    .nullable(),
);
const age = z.preprocess(
  (value) => (value === '' ? null : value),
  z.coerce
    .number()
    .int()
    .min(18, 'Age must be between 18 and 100')
    .max(100, 'Age must be between 18 and 100')
    .nullable(),
);

const leadFields = {
  full_name: z
    .string({ error: 'Full name and mobile number are required' })
    .trim()
    .min(1, 'Full name must be a non-empty string')
    .max(100),
  mobile_number: tenDigitPhone('Mobile number must be a string of exactly 10 digits'),
  alternate_number: z.preprocess(
    (value) => (value === '' ? null : value),
    tenDigitPhone('Alternate number must be a string of exactly 10 digits').nullable(),
  ),
  email: optionalEmail('Email must be a valid email address'),
  source: leadSource,
  notes: nullableText(10_000),
  age,
  address: nullableText(1_000),
  occupation: nullableText(100),
  monthly_income: nullableNumber,
  is_aware_of_digital_gold: booleanLike,
  status: leadStatus,
  next_call_at: nullableDate('next_call_at must be a valid date'),
  assigned_to: nullableId,
  location_id: nullableId,
};

export const createLeadSchema = z.object({
  full_name: leadFields.full_name,
  mobile_number: leadFields.mobile_number,
  alternate_number: leadFields.alternate_number.optional(),
  email: leadFields.email.optional(),
  source: leadFields.source.optional(),
  notes: leadFields.notes.optional(),
  age: leadFields.age.optional(),
  address: leadFields.address.optional(),
  occupation: leadFields.occupation.optional(),
  monthly_income: leadFields.monthly_income.optional(),
  is_aware_of_digital_gold: leadFields.is_aware_of_digital_gold.default(false),
  status: leadFields.status.default('New'),
  next_call_at: leadFields.next_call_at.optional(),
  assigned_to: leadFields.assigned_to.optional(),
  location_id: leadFields.location_id.optional(),
});

export const updateLeadSchema = nonEmptyPatch({
  full_name: leadFields.full_name.optional(),
  mobile_number: leadFields.mobile_number.optional(),
  alternate_number: leadFields.alternate_number.optional(),
  email: leadFields.email.optional(),
  source: leadFields.source.optional(),
  notes: leadFields.notes.optional(),
  age: leadFields.age.optional(),
  address: leadFields.address.optional(),
  occupation: leadFields.occupation.optional(),
  monthly_income: leadFields.monthly_income.optional(),
  is_aware_of_digital_gold: leadFields.is_aware_of_digital_gold.optional(),
  status: leadFields.status.optional(),
  next_call_at: leadFields.next_call_at.optional(),
  assigned_to: leadFields.assigned_to.optional(),
  location_id: leadFields.location_id.optional(),
});

export const assignmentSchema = z.object({ assigned_to: nullableId });

export const FOLLOWUP_TYPES = ['Call', 'Email', 'Meeting', 'SMS', 'WhatsApp'] as const;

export const createFollowupSchema = z.object({
  scheduled_at: dateLike('scheduled_at must be a valid future datetime').refine(
    (value) => Date.parse(value) > Date.now(),
    { message: 'scheduled_at must be a valid future datetime' },
  ),
  followup_type: z.enum(FOLLOWUP_TYPES).default('Call'),
  notes: nullableText(10_000).optional(),
});

// ---------------------------------------------------------------- customers
const customerFields = {
  name: z.string({ error: 'Name is required' }).trim().min(1, 'Name is required').max(255),
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .regex(EMAIL_PATTERN, 'Invalid email format')
    .max(255),
  phone: nullableText(50),
  address: nullableText(1_000),
  assigned_to: nullableId,
};

export const createCustomerSchema = z.object({
  name: customerFields.name,
  email: customerFields.email,
  phone: customerFields.phone.optional(),
  address: customerFields.address.optional(),
  assigned_to: customerFields.assigned_to.optional(),
});

export const updateCustomerSchema = nonEmptyPatch({
  name: customerFields.name.optional(),
  email: customerFields.email.optional(),
  phone: customerFields.phone.optional(),
  address: customerFields.address.optional(),
  assigned_to: customerFields.assigned_to.optional(),
});

// ---------------------------------------------------------------- opportunities
export const OPPORTUNITY_STAGES = [
  'Prospecting',
  'Qualification',
  'Needs Analysis',
  'Value Proposition',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const;

const opportunityStage = z.enum(OPPORTUNITY_STAGES, {
  error: `Stage must be one of: ${OPPORTUNITY_STAGES.join(', ')}`,
});
const probability = z.preprocess(
  (value) => (value === '' ? null : value),
  z.coerce
    .number()
    .min(0, 'Probability must be a number between 0 and 100')
    .max(100, 'Probability must be a number between 0 and 100')
    .nullable(),
);
const opportunityTitle = z
  .string({ error: 'Lead ID and title are required' })
  .trim()
  .min(1, 'Title must be a non-empty string')
  .max(255);

export const createOpportunitySchema = z.object({
  lead_id: requiredId('Lead ID and title are required'),
  title: opportunityTitle,
  description: nullableText(10_000).optional(),
  value: nullableNumber.optional(),
  stage: opportunityStage.default('Prospecting'),
  probability: probability.optional(),
  expected_close_date: nullableDate().optional(),
  assigned_to: nullableId.optional(),
});

export const updateOpportunitySchema = nonEmptyPatch({
  title: opportunityTitle.optional(),
  description: nullableText(10_000).optional(),
  value: nullableNumber.optional(),
  stage: opportunityStage.optional(),
  probability: probability.optional(),
  expected_close_date: nullableDate().optional(),
});

// ---------------------------------------------------------------- tasks / calendar
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

const taskTitle = z
  .string({ error: 'Title and due date are required' })
  .trim()
  .min(1, 'Title and due date are required')
  .max(255);

export const createTaskSchema = z.object({
  title: taskTitle,
  description: nullableText(10_000).optional(),
  due_date: dateLike('Title and due date are required'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  status: z.enum(TASK_STATUSES).default('pending'),
  assigned_to: nullableId.optional(),
});

export const updateTaskSchema = nonEmptyPatch(
  {
    title: taskTitle.optional(),
    description: nullableText(10_000).optional(),
    due_date: dateLike().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    assigned_to: nullableId.optional(),
  },
  'No fields to update',
);

/** Calendar events are task rows: start_date ↔ due_date, user_id ↔ assigned_to. */
export const createCalendarEventSchema = z.object({
  title: z
    .string({ error: 'Title and start date are required' })
    .trim()
    .min(1, 'Title and start date are required')
    .max(255),
  description: nullableText(10_000).optional(),
  start_date: dateLike('Title and start date are required'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  status: z.enum(TASK_STATUSES).default('pending'),
  user_id: nullableId.optional(),
});

export const updateCalendarEventSchema = nonEmptyPatch(
  {
    title: z.string().trim().min(1).max(255).optional(),
    description: nullableText(10_000).optional(),
    start_date: dateLike().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    user_id: nullableId.optional(),
  },
  'No fields to update',
);

// ---------------------------------------------------------------- notes
const noteTags = z.array(z.string().trim().min(1).max(50)).max(30);

export const createNoteSchema = z.object({
  title: z
    .string({ error: 'Title and content are required' })
    .trim()
    .min(1, 'Title and content are required')
    .max(255),
  content: z
    .string({ error: 'Title and content are required' })
    .min(1, 'Title and content are required')
    .max(50_000),
  color: z.string().trim().min(1).max(20).default('blue'),
  tags: noteTags.default([]),
});

export const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().min(1).max(50_000).optional(),
  color: z.string().trim().min(1).max(20).optional(),
  tags: noteTags.optional(),
});

// ---------------------------------------------------------------- calls
export const CALL_STATUSES = ['Scheduled', 'Completed', 'Missed', 'Cancelled'] as const;

export const initiateCallSchema = z.object({ lead_id: requiredId('Lead ID is required') });

export const endCallSchema = z.object({
  duration_seconds: z.coerce.number().int().min(0).optional(),
  call_status: z.enum(CALL_STATUSES).optional(),
  recording_url: z.string().url().max(2_000).optional(),
});

// ---------------------------------------------------------------- lead messages
export const MESSAGE_CHANNELS = ['sms', 'whatsapp'] as const;
/** Statuses a member may set manually (PATCH /messages/:id/status). */
export const MESSAGE_STATUSES = ['Sent', 'Delivered', 'Failed'] as const;
/** Full delivery lifecycle as reported by the API. */
export const MESSAGE_DELIVERY_STATUSES = [
  'Queued',
  'Sending',
  'Sent',
  'Delivered',
  'Failed',
] as const;

const channel = z.enum(MESSAGE_CHANNELS, { error: 'Channel must be either "whatsapp" or "sms"' });
const messageContent = z
  .string({ error: 'Lead ID, channel, and message content are required' })
  .trim()
  .min(1)
  .max(5_000);

export const sendMessageSchema = z.object({
  lead_id: requiredId('Lead ID, channel, and message content are required'),
  channel,
  content: messageContent,
});

export const bulkMessageSchema = z.object({
  lead_ids: z
    .array(requiredId('Lead IDs array, channel, and message text are required'), {
      error: 'Lead IDs array, channel, and message text are required',
    })
    .min(1, 'Lead IDs array, channel, and message text are required')
    .max(500),
  channel,
  content: messageContent,
});

export const messageStatusSchema = z.object({
  status: z.enum(MESSAGE_STATUSES, {
    error: 'Invalid status. Must be one of: Sent, Delivered, Failed',
  }),
});

// ---------------------------------------------------------------- chat
export const createConversationSchema = z
  .object({
    name: nullableText(255).optional(),
    is_group: z.boolean().default(false),
    participant_ids: z
      .array(requiredId('Participant IDs are required'), { error: 'Participant IDs are required' })
      .min(1)
      .max(100),
  })
  .refine((value) => !value.is_group || Boolean(value.name), {
    message: 'Group name is required',
    path: ['name'],
  });

export const sendChatMessageSchema = z.object({
  content: z
    .string({ error: 'Message content is required' })
    .min(1, 'Message content is required')
    .max(10_000),
  message_type: z.enum(['text', 'image', 'file']).default('text'),
  /** Uploaded file (POST /files/chat-attachments). Its URL and type come from the file record. */
  file_id: z.uuid().optional(),
  /** Compatibility for older clients; prefer file_id. */
  attachment_url: nullableText(2_000).optional(),
  file_type: nullableText(100).optional(),
});

export const presenceSchema = z.object({
  is_online: z.boolean({ error: 'isOnline must be a boolean' }),
});

// ---------------------------------------------------------------- locations
const locationFields = {
  name: z
    .string({ error: 'Location name is required' })
    .trim()
    .min(1, 'Location name is required')
    .max(100),
  address: nullableText(1_000),
  city: nullableText(50),
  state: nullableText(50),
  country: z.string().trim().min(1).max(50),
  pin_code: nullableText(10),
  contact_phone: nullableText(20),
  manager_id: nullableId,
};

export const createLocationSchema = z.object({
  name: locationFields.name,
  address: locationFields.address.optional(),
  city: locationFields.city.optional(),
  state: locationFields.state.optional(),
  country: locationFields.country.default('India'),
  pin_code: locationFields.pin_code.optional(),
  contact_phone: locationFields.contact_phone.optional(),
  manager_id: locationFields.manager_id.optional(),
});

export const updateLocationSchema = nonEmptyPatch({
  name: locationFields.name.optional(),
  address: locationFields.address.optional(),
  city: locationFields.city.optional(),
  state: locationFields.state.optional(),
  country: locationFields.country.optional(),
  pin_code: locationFields.pin_code.optional(),
  contact_phone: locationFields.contact_phone.optional(),
  manager_id: locationFields.manager_id.optional(),
});

export const checkInSchema = z.object({
  latitude: z.coerce.number({ error: 'Latitude and longitude are required' }).min(-90).max(90),
  longitude: z.coerce.number({ error: 'Latitude and longitude are required' }).min(-180).max(180),
  address: nullableText(1_000).optional(),
});

// ---------------------------------------------------------------- settings
export const SETTING_KEY_PATTERN = /^[a-z][a-z0-9_]{0,99}$/;

export const updateSettingsSchema = z.object({
  settings: z
    .record(z.string().regex(SETTING_KEY_PATTERN, 'Invalid settings data'), z.json())
    .refine((value) => Object.keys(value).length <= 100, { message: 'Invalid settings data' }),
});

// ---------------------------------------------------------------- members / users
export const createMemberSchema = z.object({
  full_name: z
    .string({ error: 'All fields are required: full_name, email, password, roleKey' })
    .trim()
    .min(1)
    .max(100),
  email: z
    .string({ error: 'All fields are required: full_name, email, password, roleKey' })
    .trim()
    .regex(EMAIL_PATTERN, 'Invalid email format')
    .max(100),
  password: passwordSchema,
  roleKey: z.string().trim().min(1).max(50),
});

export const updateMemberSchema = z
  .object({
    roleKey: z.string().trim().min(1).max(50).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((value) => value.roleKey !== undefined || value.status !== undefined, {
    message: 'Provide roleKey and/or status',
  });

export const updateProfileSchema = z.object({
  full_name: z
    .string({ error: 'All fields are required: full_name, email, username' })
    .trim()
    .min(1)
    .max(100),
  email: z
    .string({ error: 'All fields are required: full_name, email, username' })
    .trim()
    .regex(EMAIL_PATTERN, 'Invalid email format')
    .max(100),
  username: z
    .string({ error: 'All fields are required: full_name, email, username' })
    .trim()
    .min(1)
    .max(50),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ error: 'Email is required' })
    .trim()
    .min(1, 'Email is required')
    .regex(EMAIL_PATTERN, 'Invalid email format'),
});

export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'Token and new password are required' })
    .min(1, 'Token and new password are required')
    .max(200),
  newPassword: z
    .string({ error: 'Token and new password are required' })
    .min(8, 'Password must be at least 8 characters long')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/,
      'Password must contain at least one letter and one number',
    ),
});

export const verifyResetTokenSchema = z.object({
  token: z.string({ error: 'Token is required' }).min(1, 'Token is required').max(200),
});
