import { Injectable } from '@nestjs/common';
import {
  SalesAgentRiskTier,
  SalesAgentUserContext,
} from './sales-agent.types';

export type ToolRiskMeta = {
  riskTier: SalesAgentRiskTier;
  requiredPermissions: string[];
};

const TOOL_RISK: Record<string, ToolRiskMeta> = {
  crm_search: { riskTier: 'low', requiredPermissions: ['leads:read', 'deals:read'] },
  crm_dashboard: { riskTier: 'low', requiredPermissions: ['dashboard:read'] },
  crm_workspace: { riskTier: 'low', requiredPermissions: ['dashboard:read'] },
  pm_search: { riskTier: 'low', requiredPermissions: ['boards:read', 'pm:read', 'wiki:read'] },
  crm_sales_attention: { riskTier: 'low', requiredPermissions: ['dashboard:read'] },
  get_lead: { riskTier: 'low', requiredPermissions: ['leads:read'] },
  get_deal: { riskTier: 'low', requiredPermissions: ['deals:read'] },
  get_record_context: { riskTier: 'low', requiredPermissions: ['leads:read'] },
  draft_outreach_email: { riskTier: 'low', requiredPermissions: ['leads:read'] },
  draft_inbox_reply: { riskTier: 'low', requiredPermissions: ['inbox:read'] },
  draft_proposal: { riskTier: 'low', requiredPermissions: ['proposals'] },
  draft_contract: { riskTier: 'low', requiredPermissions: ['proposals'] },
  create_task: { riskTier: 'low', requiredPermissions: ['tasks:write', 'leads:write'] },
  create_note: { riskTier: 'low', requiredPermissions: ['notes:write', 'leads:write'] },
  update_lead_stage: { riskTier: 'low', requiredPermissions: ['leads:write'] },
  update_deal_stage: { riskTier: 'low', requiredPermissions: ['deals:write'] },
  enroll_workflow: { riskTier: 'low', requiredPermissions: ['workflows:write'] },
  send_email: { riskTier: 'high', requiredPermissions: ['inbox:send', 'outreach:write'] },
  convert_lead: { riskTier: 'high', requiredPermissions: ['leads:write'] },
  create_deal: { riskTier: 'high', requiredPermissions: ['deals:write'] },
  send_proposal: { riskTier: 'high', requiredPermissions: ['proposals'] },
  update_deal_value: { riskTier: 'high', requiredPermissions: ['deals:write'] },
  assign_owner: { riskTier: 'high', requiredPermissions: ['leads:write', 'deals:write'] },
  list_pipelines: { riskTier: 'low', requiredPermissions: ['leads:read'] },
  list_workflows: { riskTier: 'low', requiredPermissions: ['workflows:read'] },
  list_inbox_accounts: { riskTier: 'low', requiredPermissions: ['inbox:read'] },
  get_email_thread: { riskTier: 'low', requiredPermissions: ['inbox:read'] },
  schedule_call: { riskTier: 'low', requiredPermissions: ['tasks:write'] },
  suggest_next_steps: { riskTier: 'low', requiredPermissions: ['leads:read'] },
  create_lead: { riskTier: 'low', requiredPermissions: ['leads:write'] },
  extract_website_emails: { riskTier: 'low', requiredPermissions: ['leads:read'] },
  get_upcoming_follow_ups: { riskTier: 'low', requiredPermissions: ['dashboard:read'] },
  start_follow_up_sequence: { riskTier: 'low', requiredPermissions: ['workflows:write', 'leads:write'] },
};

@Injectable()
export class SalesAgentPolicyService {
  getToolRisk(toolName: string): ToolRiskMeta {
    return (
      TOOL_RISK[toolName] ?? {
        riskTier: 'high',
        requiredPermissions: ['admin:read'],
      }
    );
  }

  canUseTool(ctx: SalesAgentUserContext, toolName: string): boolean {
    if (ctx.isWorkspaceAdmin) return true;
    const meta = this.getToolRisk(toolName);
    return meta.requiredPermissions.some((p) =>
      ctx.permissions.some(
        (perm) =>
          perm === p ||
          perm === p.split(':')[0] ||
          perm === 'admin:read' ||
          perm === 'admin',
      ),
    );
  }

  shouldRequireApproval(
    toolName: string,
    settings: { autoApproveActions?: string[]; autoApproveStageNames?: string[] },
    input?: Record<string, unknown>,
  ): boolean {
    const meta = this.getToolRisk(toolName);
    if (meta.riskTier === 'low') return false;
    if (settings.autoApproveActions?.includes(toolName)) return false;
    if (
      (toolName === 'update_lead_stage' || toolName === 'update_deal_stage') &&
      input?.stageName &&
      settings.autoApproveStageNames?.some(
        (s) =>
          String(s).trim().toLowerCase() ===
          String(input.stageName).trim().toLowerCase(),
      )
    ) {
      return false;
    }
    return meta.riskTier === 'high';
  }

  buildPreviewSummary(
    toolName: string,
    input: Record<string, unknown>,
  ): string {
    switch (toolName) {
      case 'send_email':
        return `Send email to ${input.to}: "${input.subject}"`;
      case 'convert_lead':
        return `Convert lead to ${input.type}`;
      case 'create_deal':
        return `Create deal: ${input.name || '(unnamed)'}`;
      case 'send_proposal':
        return `Send proposal for ${input.module}/${input.entityId}`;
      case 'update_deal_value':
        return `Update deal value to ${input.value}`;
      case 'assign_owner':
        return `Assign owner ${input.ownerName} to ${input.recordType}`;
      case 'create_lead':
        return `Create lead: ${input.firstName}${input.lastName ? ` ${input.lastName}` : ''}${input.email ? ` <${input.email}>` : ''}`;
      case 'start_follow_up_sequence':
        return `Start ${Array.isArray(input.steps) ? input.steps.length : 0}-step follow-up for ${input.entityType} ${input.entityId}`;
      default:
        return `${toolName}: ${JSON.stringify(input).slice(0, 200)}`;
    }
  }
}

export { TOOL_RISK };
