import { CRM_API_URL } from '@/lib/crm/config';

export type SalesAgentSettings = {
  enabled: boolean;
  cronEnabled: boolean;
  maxRunsPerCronTick: number;
  cooldownHours: number;
  enabledLeadPipelineIds: string[];
  enabledDealPipelineIds: string[];
  triggerOnLeadCreated: boolean;
  triggerOnEmailReply: boolean;
  triggerOnNeverContacted: boolean;
  triggerOnReplyAwaiting: boolean;
  triggerOnWebsiteInbound: boolean;
  triggerOnStaleLeads: boolean;
  triggerOnChatInbound: boolean;
  defaultAgentRole: string;
  resumeAfterApproval: boolean;
  autoApproveStageNames: string[];
  autoApproveActions: string[];
  maxEmailsPerDay: number;
  maxEmailsPerRun: number;
  maxToolRounds: number;
};

export type SalesAgentRun = {
  _id: string;
  recordType: string;
  recordId: string;
  agentRole: string;
  status: string;
  trigger: string;
  summary?: string;
  reasoning?: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
    approvalId?: string;
    error?: string;
  }>;
  createdAt?: string;
};

export type SalesAgentApproval = {
  _id: string;
  runId: string;
  action: string;
  payload: Record<string, unknown>;
  riskTier: string;
  status: string;
  previewSummary?: string;
  recordType?: string;
  recordId?: string;
  createdAt?: string;
};

export type SalesAgentMetrics = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  pendingApprovals: number;
  approvedActions: number;
  rejectedActions: number;
  approvalRate: number;
  runsLast7Days: number;
  runsLast30Days: number;
  runsInPeriod?: number;
  emailsSentInPeriod?: number;
  runsByTrigger?: Array<{ trigger: string; count: number }>;
  runsByRole?: Array<{ role: string; count: number }>;
  approvalsByAction?: Array<{ action: string; approved: number; rejected: number }>;
  recentRuns?: Array<{
    id: string;
    recordType: string;
    recordId: string;
    status: string;
    trigger: string;
    agentRole: string;
    summary?: string;
    createdAt?: string;
  }>;
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
        : data?.message || 'Request failed',
    );
  }
  return data;
}

export async function fetchSalesAgentStatus() {
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/status`, {
    headers: authHeaders(),
  });
  if (!res.ok) return { configured: false, features: [] };
  return res.json();
}

export async function fetchSalesAgentSettings(): Promise<SalesAgentSettings> {
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/settings`, {
    headers: authHeaders(),
  });
  return parseJson(res);
}

export async function updateSalesAgentSettings(
  patch: Partial<SalesAgentSettings>,
): Promise<SalesAgentSettings> {
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/settings`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function fetchSalesAgentApprovals(status = 'pending') {
  const res = await fetch(
    `${CRM_API_URL}/crm/sales-agent/approvals?status=${encodeURIComponent(status)}`,
    { headers: authHeaders() },
  );
  return parseJson(res) as Promise<SalesAgentApproval[]>;
}

export async function approveSalesAgentAction(id: string) {
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/approvals/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return parseJson(res);
}

export async function rejectSalesAgentAction(id: string, reviewNote?: string) {
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/approvals/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reviewNote }),
  });
  return parseJson(res);
}

export async function fetchSalesAgentRuns(params?: {
  status?: string;
  recordType?: string;
  recordId?: string;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.recordType) q.set('recordType', params.recordType);
  if (params?.recordId) q.set('recordId', params.recordId);
  if (params?.limit) q.set('limit', String(params.limit));
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/runs?${q}`, {
    headers: authHeaders(),
  });
  return parseJson(res) as Promise<SalesAgentRun[]>;
}

export async function triggerSalesAgentRun(input: {
  recordType: 'Lead' | 'Deal' | 'Contact';
  recordId: string;
  instructions?: string;
}) {
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/runs/trigger`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function fetchSalesAgentMetrics(days = 30): Promise<SalesAgentMetrics> {
  const res = await fetch(
    `${CRM_API_URL}/crm/sales-agent/metrics?days=${encodeURIComponent(String(days))}`,
    { headers: authHeaders() },
  );
  return parseJson(res);
}

export async function fetchSalesAgentPendingCount(): Promise<number> {
  const res = await fetch(`${CRM_API_URL}/crm/sales-agent/approvals/count`, {
    headers: authHeaders(),
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return Number(data.count) || 0;
}

export async function fetchSalesAgentRecordSummary(
  recordType: 'Lead' | 'Deal' | 'Contact',
  recordId: string,
) {
  const res = await fetch(
    `${CRM_API_URL}/crm/sales-agent/record/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`,
    { headers: authHeaders() },
  );
  return parseJson(res) as Promise<{
    enabled: boolean;
    configured: boolean;
    agentContext: unknown;
    pendingApprovals: SalesAgentApproval[];
    pendingCount: number;
    recentRuns: SalesAgentRun[];
  }>;
}
