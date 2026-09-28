import { apiRequest } from './api';

export type AgentContext = {
  currentEntity?: {
    type: string;
    id: number;
  };
  lastTool?: string;
  slots?: Record<string, unknown>;
  pendingTool?: string | null;
  pendingIntent?: string | null;
};

export type PendingAction = {
  tool: string;
  args: Record<string, unknown>;
};

export type AgentResponse = {
  status: 'clarify' | 'confirm' | 'executed' | 'error' | 'denied';
  reply: string;
  tool?: string;
  result?: unknown;
  context?: AgentContext;
  pending_action?: PendingAction;
  missing_fields?: string[];
};

export type AgentRequest = {
  message?: string;
  context?: AgentContext | null;
  confirm?: boolean;
  pending_action?: PendingAction | null;
  tool?: string;
  args?: Record<string, unknown>;
};

export const sendAgentMessage = async (payload: AgentRequest) => {
  return apiRequest<AgentResponse>('/ai/chat', {
    method: 'POST',
    body: payload
  });
};

export const fetchAgentTools = async () => {
  return apiRequest<{ tools?: unknown[] }>('/ai/tools');
};
