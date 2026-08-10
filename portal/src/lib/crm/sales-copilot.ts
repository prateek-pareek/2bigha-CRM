import { CRM_API_URL } from '@/lib/api/config';
import type { SalesAgentApproval } from '@/lib/crm/sales-agent';

export type SalesCopilotMessage = {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  pendingApprovals?: SalesAgentApproval[];
  status?: string;
};

export type SalesCopilotQueryResult = {
  answer: string;
  sessionId: string;
  toolsUsed: string[];
  model: string;
  status: 'completed' | 'pending_approval' | string;
  pendingApprovals: SalesAgentApproval[];
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Sales Copilot request failed',
    );
  }
  return data;
}

export async function fetchSalesCopilotStatus() {
  const res = await fetch(`${CRM_API_URL}/crm/sales-copilot/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) return { configured: false, features: [] };
  return res.json();
}

export async function querySalesCopilot(
  message: string,
  options?: {
    sessionId?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  },
): Promise<SalesCopilotQueryResult> {
  const res = await fetch(`${CRM_API_URL}/crm/sales-copilot/query`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      message,
      sessionId: options?.sessionId,
      history: options?.history,
    }),
  });
  return parseJson(res);
}

export async function resumeSalesCopilotSession(sessionId: string): Promise<SalesCopilotQueryResult> {
  const res = await fetch(`${CRM_API_URL}/crm/sales-copilot/sessions/${sessionId}/resume`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseJson(res);
}

export const SUGGESTED_COPILOT_PROMPTS = [
  'Add a lead: Jane Doe at Acme Corp, jane@acme.com',
  'Find emails on acme.com',
  'What needs my attention in sales today?',
  'Show my scheduled follow-ups this week',
  'Draft and send outreach to my top stale lead',
  'Which leads have never been contacted?',
  'Create lead and schedule a 3-step follow-up cadence',
  'Search for leads at Acme Corp',
  'How is our pipeline looking this month?',
];
