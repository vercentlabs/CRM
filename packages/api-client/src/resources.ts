import type {
  ApiMetadata,
  AuditLogEntry,
  AuthSessionView,
  CalendarEvent,
  ConversionReport,
  DashboardSummary,
  LeadAgingReport,
  LeadsOverTimePoint,
  ReportPeriod,
  SalesPerformanceRow,
  Call,
  ChatMessage,
  ChatParticipant,
  Conversation,
  Customer,
  ExecutiveLocation,
  Followup,
  FollowupScheduleItem,
  GoldRate,
  Lead,
  LeadMessage,
  LeadStatus,
  Member,
  MembershipSummary,
  Note,
  Opportunity,
  OpportunityStage,
  PaginationMeta,
  RoleDefinition,
  SalesLocation,
  StoredFile,
  Task,
  TaskStatus,
} from '@crm/types';
import type {
  AssignmentInput,
  BulkMessageInput,
  CheckInInput,
  CreateCalendarEventInput,
  CreateConversationInput,
  CreateCustomerInput,
  CreateFollowupInput,
  CreateLeadInput,
  CreateLocationInput,
  CreateMemberInput,
  CreateNoteInput,
  CreateOpportunityInput,
  CreateTaskInput,
  EndCallInput,
  InitiateCallInput,
  LoginRequestInput,
  SendChatMessageInput,
  SendMessageInput,
  UpdateCalendarEventInput,
  UpdateCustomerInput,
  UpdateLeadInput,
  UpdateLocationInput,
  UpdateMemberInput,
  UpdateNoteInput,
  UpdateOpportunityInput,
  UpdateProfileInput,
  UpdateTaskInput,
} from '@crm/validation';
import type { HttpMethod, QueryValue, RequestOptions, V1Transport } from './client.js';

/**
 * Typed `/api/v1` resources shared by web and mobile. Request bodies are the
 * Zod input types from @crm/validation; responses are @crm/types DTOs. Works
 * in both cookie (web) and bearer (mobile) modes — the transport decides.
 */

export interface Page<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

type Query = Record<string, QueryValue | QueryValue[]>;

export interface LeadListQuery extends PageQuery {
  status?: LeadStatus;
  assigned_to?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: string;
}

export interface NoteListQuery extends PageQuery {
  search?: string;
  author_id?: number;
  tags?: string[];
  created_from?: string;
  created_to?: string;
  sort?: string;
}

export interface AuditListQuery extends PageQuery {
  user_id?: number;
  table_name?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
}

const enc = encodeURIComponent;

export function createResources(t: V1Transport) {
  const data = async <T>(method: HttpMethod, path: string, options?: RequestOptions) =>
    (await t.request<T>(method, path, options)).data;
  const page = async <T>(path: string, query?: object): Promise<Page<T>> => {
    const result = await t.request<T[]>('GET', path, query ? { query: query as Query } : {});
    if (!result.meta?.pagination) throw new Error(`Expected a paginated response from ${path}`);
    return { items: result.data, pagination: result.meta.pagination };
  };
  const get = <T>(path: string, query?: object) =>
    data<T>('GET', path, query ? { query: query as Query } : {});
  const post = <T>(path: string, body?: unknown) =>
    data<T>('POST', path, body === undefined ? {} : { body });
  const patch = <T>(path: string, body: unknown) => data<T>('PATCH', path, { body });
  const put = <T>(path: string, body: unknown) => data<T>('PUT', path, { body });
  const del = (path: string) => data<{ deleted: true }>('DELETE', path);

  return {
    metadata: () => get<ApiMetadata>(''),
    auth: {
      login: (body: LoginRequestInput & { organizationId?: string; client?: 'web' | 'mobile' }) =>
        data<AuthSessionView>('POST', '/auth/login', { body, anonymous: true }),
      refresh: (refreshToken?: string) =>
        data<AuthSessionView>('POST', '/auth/refresh', {
          body: refreshToken ? { refreshToken } : {},
          anonymous: true,
        }),
      logout: (refreshToken?: string) =>
        post<{ loggedOut: true }>('/auth/logout', refreshToken ? { refreshToken } : {}),
      session: () => get<AuthSessionView>('/auth/session'),
      switchOrganization: (organizationId: string) =>
        post<AuthSessionView>('/auth/switch-organization', { organizationId }),
      forgotPassword: (email: string) =>
        data<{ requested: true }>('POST', '/auth/password/forgot', {
          body: { email },
          anonymous: true,
        }),
      resetPassword: (token: string, newPassword: string) =>
        data<{ reset: true }>('POST', '/auth/password/reset', {
          body: { token, newPassword },
          anonymous: true,
        }),
      verifyResetToken: (token: string) =>
        data<{ valid: true }>('POST', '/auth/password/verify', {
          body: { token },
          anonymous: true,
        }),
    },
    organizations: {
      mine: () => get<Array<MembershipSummary & { current: boolean }>>('/organizations'),
      acceptInvitation: (organizationId: string) =>
        post<{ accepted: true }>(`/organizations/${enc(organizationId)}/accept-invitation`),
      current: () =>
        get<{
          id: string;
          name: string;
          slug: string;
          membership: { id: number; role: { key: string; name: string } };
        }>('/organization'),
      members: (query?: PageQuery) => page<Member>('/organization/members', query),
      roles: () => get<RoleDefinition[]>('/organization/roles'),
      addMember: (body: CreateMemberInput) => post<Member>('/organization/members', body),
      updateMember: (userId: number, body: UpdateMemberInput) =>
        patch<Member>(`/organization/members/${userId}`, body),
      updateProfile: (userId: number, body: UpdateProfileInput) =>
        put<Member>(`/organization/members/${userId}/profile`, body),
    },
    leads: {
      list: (query?: LeadListQuery) => page<Lead>('/leads', query),
      get: (id: number) => get<Lead>(`/leads/${id}`),
      create: (body: CreateLeadInput) => post<Lead>('/leads', body),
      update: (id: number, body: UpdateLeadInput) => patch<Lead>(`/leads/${id}`, body),
      assign: (id: number, body: AssignmentInput) => put<Lead>(`/leads/${id}/assignment`, body),
      scheduleFollowup: (id: number, body: CreateFollowupInput) =>
        post<Followup>(`/leads/${id}/followups`, body),
    },
    customers: {
      list: (query?: PageQuery & { sort?: string }) => page<Customer>('/customers', query),
      get: (id: number) => get<Customer>(`/customers/${id}`),
      create: (body: CreateCustomerInput) => post<Customer>('/customers', body),
      update: (id: number, body: UpdateCustomerInput) => patch<Customer>(`/customers/${id}`, body),
      remove: (id: number) => del(`/customers/${id}`),
    },
    opportunities: {
      list: (query?: PageQuery & { stage?: OpportunityStage; lead_id?: number; sort?: string }) =>
        page<Opportunity>('/opportunities', query),
      get: (id: number) => get<Opportunity>(`/opportunities/${id}`),
      create: (body: CreateOpportunityInput) => post<Opportunity>('/opportunities', body),
      update: (id: number, body: UpdateOpportunityInput) =>
        patch<Opportunity>(`/opportunities/${id}`, body),
      assign: (id: number, body: AssignmentInput) =>
        put<Opportunity>(`/opportunities/${id}/assignment`, body),
    },
    tasks: {
      list: (
        query?: PageQuery & {
          status?: TaskStatus;
          due_from?: string;
          due_to?: string;
          sort?: string;
        },
      ) => page<Task>('/tasks', query),
      get: (id: number) => get<Task>(`/tasks/${id}`),
      create: (body: CreateTaskInput) => post<Task>('/tasks', body),
      update: (id: number, body: UpdateTaskInput) => patch<Task>(`/tasks/${id}`, body),
      remove: (id: number) => del(`/tasks/${id}`),
    },
    calendar: {
      events: (query?: { from?: string; to?: string }) =>
        get<CalendarEvent[]>('/calendar/events', query),
      create: (body: CreateCalendarEventInput) => post<CalendarEvent>('/calendar/events', body),
      update: (id: number, body: UpdateCalendarEventInput) =>
        patch<CalendarEvent>(`/calendar/events/${id}`, body),
      remove: (id: number) => del(`/calendar/events/${id}`),
    },
    followups: {
      schedule: (query?: { overdue?: boolean }) => get<FollowupScheduleItem[]>('/followups', query),
      complete: (id: number) => post<Followup>(`/followups/${id}/complete`),
    },
    notes: {
      list: (query?: NoteListQuery) => page<Note>('/notes', query),
      get: (id: number) => get<Note>(`/notes/${id}`),
      create: (body: CreateNoteInput) => post<Note>('/notes', body),
      update: (id: number, body: UpdateNoteInput) => patch<Note>(`/notes/${id}`, body),
      remove: (id: number) => del(`/notes/${id}`),
    },
    calls: {
      list: (query?: PageQuery) => page<Call>('/calls', query),
      initiate: (body: InitiateCallInput) => post<Call>('/calls', body),
      end: (id: number, body: EndCallInput) => post<Call>(`/calls/${id}/end`, body),
    },
    messages: {
      list: (query?: PageQuery & { lead_id?: number }) => page<LeadMessage>('/messages', query),
      send: (body: SendMessageInput) => post<LeadMessage>('/messages', body),
      sendBulk: (body: BulkMessageInput) =>
        post<{ count: number; ids: number[] }>('/messages/bulk', body),
      setStatus: (id: number, status: LeadMessage['status']) =>
        patch<LeadMessage>(`/messages/${id}/status`, { status }),
    },
    chat: {
      conversations: () => get<Conversation[]>('/chat/conversations'),
      start: (body: CreateConversationInput) =>
        post<{ id: number; name: string; is_group: boolean; participant_ids: number[] }>(
          '/chat/conversations',
          body,
        ),
      messages: (conversationId: number) =>
        get<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`),
      send: (conversationId: number, body: SendChatMessageInput) =>
        post<ChatMessage>(`/chat/conversations/${conversationId}/messages`, body),
      markRead: (conversationId: number) =>
        post<{ read: true }>(`/chat/conversations/${conversationId}/read`),
      participants: (conversationId: number) =>
        get<ChatParticipant[]>(`/chat/conversations/${conversationId}/participants`),
      setPresence: (isOnline: boolean) => put<unknown>('/chat/presence', { is_online: isOnline }),
    },
    files: {
      uploadChatAttachment: (file: Blob, fileName?: string) => {
        const form = new FormData();
        if (fileName) form.append('file', file, fileName);
        else form.append('file', file);
        return data<StoredFile>('POST', '/files/chat-attachments', {
          body: form,
          timeoutMs: 60_000,
        });
      },
    },
    locations: {
      list: () => get<SalesLocation[]>('/locations'),
      get: (id: number) => get<SalesLocation>(`/locations/${id}`),
      create: (body: CreateLocationInput) => post<SalesLocation>('/locations', body),
      update: (id: number, body: UpdateLocationInput) =>
        patch<SalesLocation>(`/locations/${id}`, body),
      remove: (id: number) => del(`/locations/${id}`),
      executives: () => get<ExecutiveLocation[]>('/locations/executives'),
      checkIn: (body: CheckInInput) => put<unknown>('/locations/me', body),
    },
    reports: {
      dashboardSummary: () => get<DashboardSummary>('/reports/dashboard-summary'),
      salesPerformance: (query?: { days?: number; user_id?: number }) =>
        get<SalesPerformanceRow[]>('/reports/sales-performance', query),
      leadAging: () => get<LeadAgingReport>('/reports/lead-aging'),
      conversion: (query?: { days?: number; user_id?: number }) =>
        get<ConversionReport>('/reports/conversion', query),
      leadsOverTime: (query?: { period?: ReportPeriod }) =>
        get<LeadsOverTimePoint[]>('/reports/leads-over-time', query),
      /** CSV text of my (own scope) or the organization's leads. */
      leadsCsv: () =>
        t.raw<string>('GET', '/reports/leads-export', {
          headers: { Accept: 'text/csv' },
          timeoutMs: 60_000,
        }),
    },
    settings: {
      get: () => get<Record<string, string>>('/settings'),
      update: (settings: Record<string, unknown>) =>
        patch<Record<string, string>>('/settings', { settings }),
      verifyEmail: () => post<{ valid: true }>('/settings/email/verify'),
      sendTestEmail: (email?: string) =>
        post<{ sent: true }>('/settings/email/test', email ? { email } : {}),
    },
    audit: {
      list: (query?: AuditListQuery) => page<AuditLogEntry>('/audit-logs', query),
    },
    market: {
      goldRate: () => get<GoldRate>('/market/gold-rate'),
      refreshGoldRate: () => post<GoldRate>('/market/gold-rate/refresh'),
    },
  };
}

export type CrmResources = ReturnType<typeof createResources>;
