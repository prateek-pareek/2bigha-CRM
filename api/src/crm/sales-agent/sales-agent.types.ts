export type SalesAgentRole =
  | 'sales'
  | 'sdr'
  | 'qualification'
  | 'ae'
  | 'renewal';

export type SalesAgentRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'pending_approval'
  | 'cancelled';

export type SalesAgentApprovalStatus = 'pending' | 'approved' | 'rejected';

export type SalesAgentRiskTier = 'low' | 'high';

export type SalesAgentRecordType = 'Lead' | 'Contact';

export type SalesAgentTrigger =
  | 'manual'
  | 'copilot'
  | 'cron'
  | 'lead_created'
  | 'lead_stage_changed'
  | 'email_reply_received'
  | 'website_inbound'
  | 'chat_inbound'
  | 'stale_lead';

export type SalesAgentToolCall = {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  riskTier?: SalesAgentRiskTier;
  approvalId?: string;
  executedAt?: string;
  error?: string;
};

export type SalesAgentUserContext = {
  email: string;
  displayName: string;
  userId: string;
  isWorkspaceAdmin: boolean;
  effectiveOwner: string;
  permissions: string[];
};

export type SalesAgentEvent = {
  trigger: SalesAgentTrigger;
  recordType: SalesAgentRecordType;
  recordId: string;
  user?: any;
  metadata?: Record<string, unknown>;
};

export type AnthropicToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
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
  runsInPeriod: number;
  emailsSentInPeriod: number;
  runsByTrigger: Array<{ trigger: string; count: number }>;
  runsByRole: Array<{ role: string; count: number }>;
  approvalsByAction: Array<{ action: string; approved: number; rejected: number }>;
  recentRuns: Array<{
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
