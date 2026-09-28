import type {
  CallStatus,
  LeadStatus,
  MessageChannel,
  MessageStatus,
  OpportunityStage,
  TaskPriority,
  TaskStatus,
} from '@crm/types';
import type { BadgeTone } from '@crm/ui';
import {
  FOLLOWUP_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MESSAGE_CHANNELS,
  OPPORTUNITY_STAGES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@crm/validation';

/** User-facing labels for API enum values. The values themselves come from @crm/validation. */

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

export const LEAD_STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  New: 'info',
  Contacted: 'primary',
  Qualified: 'warning',
  Converted: 'success',
  Lost: 'neutral',
};
export const LEAD_STATUS_OPTIONS = LEAD_STATUSES.map((value) => ({ value, label: value }));

export const LEAD_SOURCE_LABEL: Record<(typeof LEAD_SOURCES)[number], string> = {
  website: 'Website',
  referral: 'Referral',
  social_media: 'Social media',
  email_campaign: 'Email campaign',
  cold_call: 'Cold call',
  event: 'Event',
  other: 'Other',
};
export const LEAD_SOURCE_OPTIONS = options(LEAD_SOURCES, LEAD_SOURCE_LABEL);
export const leadSourceLabel = (value: string | null | undefined) =>
  value ? (LEAD_SOURCE_LABEL[value as keyof typeof LEAD_SOURCE_LABEL] ?? value) : null;

export const STAGE_TONE: Record<OpportunityStage, BadgeTone> = {
  Prospecting: 'neutral',
  Qualification: 'info',
  'Needs Analysis': 'info',
  'Value Proposition': 'primary',
  Proposal: 'primary',
  Negotiation: 'warning',
  'Closed Won': 'success',
  'Closed Lost': 'danger',
};
export const STAGE_OPTIONS = OPPORTUNITY_STAGES.map((value) => ({ value, label: value }));

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const TASK_STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'neutral',
};
export const TASK_STATUS_OPTIONS = options(TASK_STATUSES, TASK_STATUS_LABEL);

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
export const TASK_PRIORITY_TONE: Record<TaskPriority, BadgeTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};
export const TASK_PRIORITY_OPTIONS = options(TASK_PRIORITIES, TASK_PRIORITY_LABEL);

export const FOLLOWUP_TYPE_OPTIONS = FOLLOWUP_TYPES.map((value) => ({ value, label: value }));

export const CHANNEL_LABEL: Record<MessageChannel, string> = { sms: 'SMS', whatsapp: 'WhatsApp' };
export const CHANNEL_OPTIONS = options(MESSAGE_CHANNELS, CHANNEL_LABEL);

export const MESSAGE_STATUS_TONE: Record<MessageStatus, BadgeTone> = {
  Queued: 'neutral',
  Sending: 'neutral',
  Sent: 'info',
  Delivered: 'success',
  Failed: 'danger',
};

/** Readable reason for a failed lead message (codes come from the delivery worker). */
export function messageFailureLabel(code: string | null): string | null {
  if (!code) return null;
  const known: Record<string, string> = {
    CHANNEL_NOT_SUPPORTED: 'WhatsApp sending is not connected',
    PROVIDER_NOT_CONFIGURED: 'SMS sending is not configured',
    INVALID_RECIPIENT: 'Invalid phone number',
    DELIVERY_UNKNOWN: 'Delivery could not be confirmed',
  };
  return known[code] ?? 'Not delivered';
}

/** Calls stay `Scheduled` while the provider connects them. */
export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  Scheduled: 'In progress',
  Completed: 'Completed',
  Missed: 'Missed',
  Cancelled: 'Failed or cancelled',
};
export const CALL_STATUS_TONE: Record<CallStatus, BadgeTone> = {
  Scheduled: 'info',
  Completed: 'success',
  Missed: 'warning',
  Cancelled: 'danger',
};
export const CALL_OUTCOME_OPTIONS: Array<{
  value: Exclude<CallStatus, 'Scheduled'>;
  label: string;
}> = [
  { value: 'Completed', label: 'Connected / completed' },
  { value: 'Missed', label: 'No answer' },
  { value: 'Cancelled', label: 'Cancelled' },
];

/** Audit action codes (e.g. MEMBER_ROLE_CHANGED) → "Member role changed". */
export const humanizeCode = (code: string) =>
  code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
