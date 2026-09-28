import type {
  CallStatus,
  LeadStatus,
  MessageChannel,
  MessageStatus,
  OpportunityStage,
  TaskPriority,
  TaskStatus,
} from '@crm/types';
import {
  FOLLOWUP_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  MESSAGE_CHANNELS,
  OPPORTUNITY_STAGES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@crm/validation';
import type { Tone } from '../components/ui/Badge';

/** User-facing labels for API enum values; the values come from @crm/validation. */

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

const options = <T extends string>(values: readonly T[], labels: Record<T, string>): Option<T>[] =>
  values.map((value) => ({ value, label: labels[value] }));

export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  New: 'info',
  Contacted: 'primary',
  Qualified: 'warning',
  Converted: 'success',
  Lost: 'neutral',
};
export const LEAD_STATUS_OPTIONS: Option<LeadStatus>[] = LEAD_STATUSES.map((value) => ({
  value,
  label: value,
}));

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

export const STAGE_TONE: Record<OpportunityStage, Tone> = {
  Prospecting: 'neutral',
  Qualification: 'info',
  'Needs Analysis': 'info',
  'Value Proposition': 'primary',
  Proposal: 'primary',
  Negotiation: 'warning',
  'Closed Won': 'success',
  'Closed Lost': 'danger',
};
export const STAGE_OPTIONS: Option<OpportunityStage>[] = OPPORTUNITY_STAGES.map((value) => ({
  value,
  label: value,
}));

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = {
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
export const TASK_PRIORITY_TONE: Record<TaskPriority, Tone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};
export const TASK_PRIORITY_OPTIONS = options(TASK_PRIORITIES, TASK_PRIORITY_LABEL);

export const FOLLOWUP_TYPE_OPTIONS: Option[] = FOLLOWUP_TYPES.map((value) => ({
  value,
  label: value,
}));

export const CHANNEL_LABEL: Record<MessageChannel, string> = { sms: 'SMS', whatsapp: 'WhatsApp' };
export const CHANNEL_OPTIONS = options(MESSAGE_CHANNELS, CHANNEL_LABEL);
export const MESSAGE_STATUS_TONE: Record<MessageStatus, Tone> = {
  Sent: 'info',
  Delivered: 'success',
  Failed: 'danger',
};

/** Calls stay `Scheduled` while the provider connects them. */
export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  Scheduled: 'In progress',
  Completed: 'Completed',
  Missed: 'Missed',
  Cancelled: 'Failed or cancelled',
};
export const CALL_STATUS_TONE: Record<CallStatus, Tone> = {
  Scheduled: 'info',
  Completed: 'success',
  Missed: 'warning',
  Cancelled: 'danger',
};
export const CALL_OUTCOME_OPTIONS: Option<Exclude<CallStatus, 'Scheduled'>>[] = [
  { value: 'Completed', label: 'Connected / completed' },
  { value: 'Missed', label: 'No answer' },
  { value: 'Cancelled', label: 'Cancelled' },
];

/** Notes keep their priority in `color` (historical format shared with the web). */
export const NOTE_PRIORITIES: Array<Option & { tone: Tone }> = [
  { value: 'blue', label: 'Normal', tone: 'primary' },
  { value: 'green', label: 'Low', tone: 'success' },
  { value: 'yellow', label: 'Medium', tone: 'warning' },
  { value: 'red', label: 'High', tone: 'danger' },
];
export const notePriority = (color: string) =>
  NOTE_PRIORITIES.find((p) => p.value === color) ?? NOTE_PRIORITIES[0]!;

/** Audit action codes (MEMBER_ROLE_CHANGED) → "Member role changed". */
export const humanizeCode = (code: string) =>
  code
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word, i) => (i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
