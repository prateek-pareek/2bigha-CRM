import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AnthropicClientService } from '../../integrations/anthropic/anthropic-client.service';
import { GlobalSearchService } from '../core/global-search.service';
import { ReportingService } from '../reporting/reporting.service';
import { CRMService } from '../core/crm.service';
import {
  hasCrmAdminFromDbUser,
  hasCrmAdminJwtBypass,
} from '../shared/crm-admin-access.util';
import { QueryDataIntelligenceDto } from './dto/query-data-intelligence.dto';
import {
  DataIntelligenceQueryResult,
  DataIntelligenceUserContext,
} from './data-intelligence.types';
import {
  DATA_INTELLIGENCE_TOOLS,
  summarizeSearchSlice,
} from './data-intelligence.tools';

const SYSTEM_PROMPT = `You are 2Bigha Data Intelligence — an assistant that answers questions about CRM data retrieved via tools.

Rules:
- Always call tools when the user asks about records, metrics, pipeline, leads, or deals. Do not invent IDs or numbers.
- Scope answers to data returned by tools. If tools return nothing, say so clearly.
- Cite record types and key fields (name, email, stage, owner). Include Mongo _id when useful for deep links (/crm/leads/{id}, /crm/contacts/{id}, /crm/deals/{id}).
- For non-admin users, data is already scoped to their ownership — do not claim team-wide totals unless the tool returned org-wide data.
- Platform modules: CRM (leads, contacts, deals, clients, outreach, inbox, email intelligence, workflows).
- Be concise, actionable, and use bullet lists for multiple records.
- If asked how to configure something (email finder, AI outreach, integrations), explain the CRM Settings path.`;

@Injectable()
export class DataIntelligenceService {
  private readonly logger = new Logger(DataIntelligenceService.name);
  private readonly maxToolRounds = 6;

  constructor(
    private readonly anthropic: AnthropicClientService,
    private readonly globalSearch: GlobalSearchService,
    private readonly reporting: ReportingService,
    private readonly crmService: CRMService,
  ) {}

  getStatus() {
    const llm = this.anthropic.getLlmStatus();
    return {
      configured: llm.configured,
      llm,
      features: ['crm_search', 'crm_dashboard', 'crm_sales_attention', 'crm_workspace'],
      modelHint:
        'Uses AI_LLM_PROVIDER (auto / anthropic / openai / google) and CRM → Settings → AI Outreach model.',
    };
  }

  buildUserContext(reqUser: any, crmDbUser: any): DataIntelligenceUserContext {
    const permissions = this.mergePermissions(reqUser, crmDbUser);
    const isWorkspaceAdmin =
      hasCrmAdminJwtBypass(reqUser) || hasCrmAdminFromDbUser(crmDbUser);
    const displayName =
      `${crmDbUser?.firstName || ''} ${crmDbUser?.lastName || ''}`.trim() ||
      crmDbUser?.email ||
      reqUser?.email ||
      'User';
    const effectiveOwner = isWorkspaceAdmin ? 'All' : displayName;

    return {
      email: String(reqUser?.email || crmDbUser?.email || ''),
      displayName,
      isWorkspaceAdmin,
      effectiveOwner,
      permissions,
    };
  }

  async query(
    dto: QueryDataIntelligenceDto,
    reqUser: any,
    crmDbUser: any,
  ): Promise<DataIntelligenceQueryResult> {
    const question = dto.question?.trim();
    if (!question) {
      throw new BadRequestException('Question is required.');
    }

    const ctx = this.buildUserContext(reqUser, crmDbUser);
    const system = `${SYSTEM_PROMPT}\n\nCurrent user: ${ctx.displayName} (${ctx.email}). Workspace admin: ${ctx.isWorkspaceAdmin}. Data owner scope: ${ctx.effectiveOwner}.`;

    const messages: Array<Record<string, unknown>> = [];
    for (const item of dto.history ?? []) {
      const role = item.role === 'assistant' ? 'assistant' : 'user';
      messages.push({ role, content: item.content.trim() });
    }
    messages.push({ role: 'user', content: question });

    const toolsUsed: string[] = [];
    let round = 0;
    let resolvedModel = '';

    while (round < this.maxToolRounds) {
      round += 1;
      const turn = await this.anthropic.createMessagesWithToolsTurn({
        system,
        tools: DATA_INTELLIGENCE_TOOLS,
        messages,
        maxTokens: 4096,
        featureLabel: 'Data Intelligence',
      });
      resolvedModel = turn.model;

      const content = turn.content ?? [];
      const stopReason = turn.stop_reason;

      messages.push({ role: 'assistant', content });

      const toolUses = content.filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0 || stopReason === 'end_turn') {
        const text = content
          .filter((b) => b.type === 'text')
          .map((b) => String(b.text ?? ''))
          .join('\n')
          .trim();
        if (!text) {
          throw new ServiceUnavailableException(
            'Data Intelligence returned an empty answer.',
          );
        }
        return { answer: text, toolsUsed, model: resolvedModel };
      }

      const toolResults: Array<Record<string, unknown>> = [];
      for (const toolUse of toolUses) {
        const name = String(toolUse.name ?? '');
        const id = String(toolUse.id ?? '');
        const input = (toolUse.input ?? {}) as Record<string, unknown>;
        toolsUsed.push(name);

        let result: unknown;
        try {
          result = await this.runTool(name, input, ctx, reqUser);
        } catch (err) {
          result = {
            error: err instanceof Error ? err.message : 'Tool execution failed',
          };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    throw new ServiceUnavailableException(
      'Data Intelligence needed too many tool rounds. Try a narrower question.',
    );
  }

  private async runTool(
    name: string,
    input: Record<string, unknown>,
    ctx: DataIntelligenceUserContext,
    reqUser: any,
  ): Promise<unknown> {
    const owner =
      ctx.effectiveOwner === 'All' ? undefined : ctx.effectiveOwner;

    switch (name) {
      case 'crm_search': {
        const query = String(input.query ?? '').trim();
        if (query.length < 2) {
          return { error: 'Search query must be at least 2 characters.' };
        }
        const data = await this.globalSearch.search(query, { full: true });
        return summarizeSearchSlice(data as Record<string, unknown>);
      }
      case 'crm_dashboard': {
        const days = Math.min(
          Math.max(Number(input.days) || 30, 1),
          365,
        );
        const data = await this.reporting.getDashboardData(days, owner);
        return this.trimPayload(data);
      }
      case 'crm_sales_attention': {
        const data = await this.reporting.getSalesAttention(owner);
        return this.trimPayload(data);
      }
      case 'crm_workspace': {
        const window = input.window ? String(input.window) : undefined;
        const data = await this.crmService.getSalesWorkspace(
          ctx.isWorkspaceAdmin ? undefined : owner,
          reqUser,
          window,
          'attention,tasks,deals,activity,leads',
        );
        return this.trimPayload(data);
      }
      case 'pm_search': {
        return { error: 'PM search is not available in CRM-only mode.' };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private canUsePmSearch(permissions: string[]): boolean {
    const candidates = ['boards:read', 'pm:read', 'wiki:read', 'boards', 'pm', 'wiki'];
    return candidates.some(
      (c) =>
        permissions.includes(c) ||
        permissions.includes(`${c}:read`) ||
        permissions.includes(c.split(':')[0]),
    );
  }

  private mergePermissions(reqUser: any, crmDbUser: any): string[] {
    const userRole = crmDbUser?.roleId as any;
    const dbRolePermissions =
      userRole?.permissions
        ?.map((p: any) => (typeof p === 'string' ? p : p?.name || p?.key))
        .filter(Boolean) || [];
    const jwtCrm = Array.isArray(reqUser?.crmPermissions)
      ? reqUser.crmPermissions
      : [];
    const jwtHrms = Array.isArray(reqUser?.permissions)
      ? reqUser.permissions
      : [];
    return Array.from(
      new Set([
        ...dbRolePermissions,
        ...jwtCrm,
        ...jwtHrms,
        ...(crmDbUser?.permissions || []),
      ]),
    );
  }

  private trimPayload(value: unknown, depth = 0): unknown {
    if (value == null || depth > 4) return value;
    if (Array.isArray(value)) {
      return value.slice(0, 25).map((v) => this.trimPayload(v, depth + 1));
    }
    if (typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
    for (const [k, v] of entries) {
      if (k.startsWith('__')) continue;
      out[k] = this.trimPayload(v, depth + 1);
    }
    return out;
  }
}
