/**
 * Wire DTOs of the CRM domain (`/api/v1`). These describe JSON responses, not
 * database rows: timestamps are ISO-8601 strings, NUMERIC columns are strings,
 * and fields are snake_case as served. Organization ids never appear here —
 * the tenant is implied by the session.
 */

/** ISO-8601 timestamp (or date) as serialized by the API. */
export type Timestamp = string;

export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Converted' | 'Lost';

export interface Lead {
  id: number;
  full_name: string;
  mobile_number: string;
  alternate_number: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  age: number | null;
  address: string | null;
  occupation: string | null;
  monthly_income: string | null;
  is_aware_of_digital_gold: boolean;
  status: LeadStatus;
  next_call_at: Timestamp | null;
  created_by: number | null;
  assigned_to: number | null;
  location_id: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  assigned_user_name: string | null;
  location_name: string | null;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  assigned_to: number | null;
  created_by: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type OpportunityStage =
  | 'Prospecting'
  | 'Qualification'
  | 'Needs Analysis'
  | 'Value Proposition'
  | 'Proposal'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost';

export interface Opportunity {
  id: number;
  lead_id: number;
  title: string;
  description: string | null;
  value: string | null;
  stage: OpportunityStage;
  probability: number | null;
  expected_close_date: Timestamp | null;
  created_by: number;
  assigned_to: number | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  lead_name: string | null;
  lead_email: string | null;
  assigned_to_name: string | null;
}

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  due_date: Timestamp;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: number | null;
  created_by: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
}

/** Calendar events are a projection over tasks (there is no events table). */
export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  start_date: Timestamp;
  end_date: Timestamp;
  priority: TaskPriority;
  status: TaskStatus;
  user_id: number | null;
  user_name: string | null;
  event_type: 'task';
}

export type FollowupType = 'Call' | 'Email' | 'Meeting' | 'SMS' | 'WhatsApp';

export interface Followup {
  id: number;
  lead_id: number;
  assigned_to: number;
  followup_date: Timestamp;
  followup_type: FollowupType;
  notes: string | null;
  status: 'Pending' | 'Completed' | 'Cancelled';
  completed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** The follow-up schedule: leads with a scheduled next call. */
export interface FollowupScheduleItem {
  lead_id: number;
  lead_name: string;
  lead_email: string | null;
  lead_mobile: string;
  lead_status: string;
  next_call_at: Timestamp;
  assigned_to: number | null;
  assigned_to_name: string | null;
  overdue: boolean;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
  tags: string[];
  created_by: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  author_name: string | null;
  author_email: string | null;
}

export type CallStatus = 'Scheduled' | 'Completed' | 'Missed' | 'Cancelled';

export interface Call {
  id: number;
  lead_id: number;
  user_id: number;
  call_status: CallStatus;
  start_time: Timestamp;
  end_time: Timestamp | null;
  duration_seconds: number | null;
  notes: string | null;
  outcome: string | null;
  plivo_call_uuid: string | null;
  recording_url: string | null;
  recording_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  lead_name: string;
}

export type MessageChannel = 'sms' | 'whatsapp';
export type MessageStatus = 'Sent' | 'Delivered' | 'Failed';

/** A message sent to a lead (SMS/WhatsApp), distinct from internal chat. */
export interface LeadMessage {
  id: number;
  lead_id: number;
  user_id: number;
  message_type: 'SMS' | 'Email' | 'WhatsApp';
  subject: string | null;
  content: string;
  status: MessageStatus;
  sent_at: Timestamp;
  created_at: Timestamp;
  lead_name: string;
}

export interface ChatParticipant {
  user_id: number;
  is_online: boolean;
  full_name: string | null;
  username: string | null;
  /** DEPRECATED legacy role id (display only). */
  role_id: number | null;
}

export interface Conversation {
  id: number;
  name: string;
  is_group: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_read_at: Timestamp | null;
  last_message: string | null;
  last_message_time: Timestamp | null;
  last_message_sender_id: number | null;
  last_message_sender_name: string | null;
  unread_count: number;
  participants: ChatParticipant[];
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  message_type: string;
  attachment_url: string | null;
  file_type: string | null;
  is_read: boolean;
  created_at: Timestamp;
  sender_name: string | null;
  sender_username: string | null;
  sender_role_id: number | null;
}

export interface StoredFile {
  url: string;
  fileId: string;
  name: string;
  size: number;
  fileType: string;
}

export interface SalesLocation {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pin_code: string | null;
  contact_phone: string | null;
  manager_id: number | null;
  manager_name: string | null;
  created_at: Timestamp;
}

export interface ExecutiveLocation {
  id: number;
  full_name: string;
  latitude: string | null;
  longitude: string | null;
  address: string | null;
  updated_at: Timestamp | null;
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: number | null;
  old_values: unknown;
  new_values: unknown;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: Timestamp;
}

/** A user as a member of the active organization. */
export interface Member {
  id: number;
  full_name: string;
  email: string;
  username: string;
  /** DEPRECATED legacy role id (1/2/3) for UI compatibility; null for custom roles. */
  role_id: number | null;
  role_key: string;
  role_name: string;
  membership_id: number;
  membership_status: 'active' | 'invited' | 'suspended';
  is_active: boolean;
}

export interface RoleDefinition {
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: Record<string, 'own' | 'organization'>;
}

export type GoldWeights = Record<'1g' | '5g' | '10g' | '50g' | '100g', number>;

export interface GoldRate {
  updated_at: Timestamp;
  gold_22k: GoldWeights;
  gold_24k: GoldWeights;
  source: 'live' | 'cache';
  warning: false | string;
  cacheAge?: number;
  isExpired?: boolean;
}

/** `GET /api/v1` */
export interface ApiMetadata {
  name: string;
  version: string;
  openapi: string;
}
