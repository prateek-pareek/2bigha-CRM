import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AnthropicClientService } from '../../integrations/anthropic/anthropic-client.service';
import { CRMService } from '../core/crm.service';
import { GlobalSearchService } from '../core/global-search.service';
import { ReportingService } from '../reporting/reporting.service';
import { CrmAiService } from '../ai/crm-ai.service';
import { WorkflowsService } from '../automation/workflows.service';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';
import { EmailTrackingService } from '../email/email-tracking.service';
import { WebsiteEmailExtractorService } from '../email-intelligence/website-email-extractor.service';
import { AuditLogService } from '../admin/audit-log.service';
import {
  hasCrmAdminFromDbUser,
  hasCrmAdminJwtBypass,
} from '../shared/crm-admin-access.util';
import { summarizeSearchSlice } from '../data-intelligence/data-intelligence.tools';
import {
  SalesAgentRun,
  SalesAgentRunDocument,
} from './schemas/sales-agent-run.schema';
import {
  SalesAgentApproval,
  SalesAgentApprovalDocument,
} from './schemas/sales-agent-approval.schema';
import {
  SalesAgentSettings,
  SalesAgentSettingsDocument,
} from './schemas/sales-agent-settings.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { PipelinesService } from '../core/pipelines.service';
import { SalesAgentPolicyService } from './sales-agent-policy.service';
import { SALES_AGENT_TOOLS } from './sales-agent.tools';
import {
  SALES_COPILOT_SYSTEM_PROMPT,
  SALES_COPILOT_TOOLS,
} from './sales-copilot.tools';
import { QuerySalesCopilotDto } from './dto/query-sales-copilot.dto';
import { buildSystemPrompt, resolveAgentRole } from './sales-agent.prompts';
import {
  SalesAgentEvent,
  SalesAgentMetrics,
  SalesAgentApprovalStatus,
  SalesAgentRecordType,
  SalesAgentRole,
  SalesAgentToolCall,
  SalesAgentTrigger,
  SalesAgentUserContext,
} from './sales-agent.types';
import { UpdateSalesAgentSettingsDto } from './dto/sales-agent.dto';

type RunExecutionState = {
  runId: Types.ObjectId;
  recordType: SalesAgentRecordType;
  recordId: string;
  settings: SalesAgentSettings;
  emailsSentThisRun: number;
  pendingApproval: boolean;
};

@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger(SalesAgentService.name);

  constructor(
    @InjectModel(SalesAgentRun.name, 'crmConnection')
    private runModel: Model<SalesAgentRunDocument>,
    @InjectModel(SalesAgentApproval.name, 'crmConnection')
    private approvalModel: Model<SalesAgentApprovalDocument>,
    @InjectModel(SalesAgentSettings.name, 'crmConnection')
    private settingsModel: Model<SalesAgentSettingsDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    private readonly anthropic: AnthropicClientService,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
    private readonly globalSearch: GlobalSearchService,
    private readonly reporting: ReportingService,
    private readonly policy: SalesAgentPolicyService,
    @Inject(forwardRef(() => CrmAiService))
    private readonly crmAi: CrmAiService,
    @Inject(forwardRef(() => WorkflowsService))
    private readonly workflowsService: WorkflowsService,
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccounts: InboxAccountsService,
    private readonly emailTracking: EmailTrackingService,
    private readonly auditLog: AuditLogService,
    private readonly pipelinesService: PipelinesService,
    private readonly websiteEmailExtractor: WebsiteEmailExtractorService,
  ) { }

  async getPendingApprovalCount(): Promise<number> {
    return this.approvalModel.countDocuments({ status: 'pending' });
  }

  async getRecordSummary(recordType: SalesAgentRecordType, recordId: string) {
    if (!Types.ObjectId.isValid(recordId)) {
      throw new BadRequestException('Invalid record id');
    }
    const settings = await this.getSettings();
    let agentContext: unknown = null;
    if (recordType === 'Lead') {
      const lead = await this.leadModel.findById(recordId).select('agentContext').lean().exec();
      agentContext = (lead as any)?.agentContext;
    }
    const [recentRuns, pendingApprovals] = await Promise.all([
      this.runModel
        .find({ recordType, recordId: new Types.ObjectId(recordId) })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .exec(),
      this.approvalModel
        .find({
          recordType,
          recordId: new Types.ObjectId(recordId),
          status: 'pending',
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    ]);
    return {
      enabled: settings.enabled,
      configured: this.anthropic.isConfigured(),
      agentContext,
      pendingApprovals,
      pendingCount: pendingApprovals.length,
      recentRuns: recentRuns.map((r) => ({
        id: String(r._id),
        status: r.status,
        agentRole: r.agentRole,
        trigger: r.trigger,
        summary: r.summary,
        createdAt: (r as any).createdAt,
      })),
    };
  }

  getStatus() {
    return {
      configured: this.anthropic.isConfigured(),
      features: SALES_AGENT_TOOLS.map((t) => t.name),
    };
  }

  getCopilotStatus() {
    const llm = this.anthropic.getLlmStatus();
    return {
      configured: llm.configured,
      llm,
      features: SALES_COPILOT_TOOLS.map((t) => t.name),
    };
  }

  async queryCopilot(
    dto: QuerySalesCopilotDto,
    reqUser: any,
    crmDbUser: any,
  ) {
    const message = dto.message?.trim();
    if (!message) {
      throw new BadRequestException('Message is required.');
    }

    const ctx = this.buildUserContext(reqUser, crmDbUser);
    const settings = await this.getSettings();

    let run = await this.resolveCopilotRun(dto.sessionId, ctx);
    const messages: Array<Record<string, unknown>> = [];
    const historyLimit = 8;
    for (const item of (dto.history ?? []).slice(-historyLimit)) {
      const content = item.content?.trim();
      if (!content) continue;
      messages.push({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content,
      });
    }
    messages.push({ role: 'user', content: message });

    const execState: RunExecutionState = {
      runId: run._id as Types.ObjectId,
      recordType: 'Lead',
      recordId: String(run.recordId),
      settings,
      emailsSentThisRun: 0,
      pendingApproval: false,
    };

    const toolCalls: SalesAgentToolCall[] = [...(run.toolCalls || [])];
    const toolsUsed: string[] = [];
    let round = run.toolRoundCount ?? 0;
    const maxRounds = Math.min(settings.maxToolRounds ?? 12, 8);
    let finalAnswer = '';
    let resolvedModel = run.model || '';

    const systemPrompt = `${SALES_COPILOT_SYSTEM_PROMPT}\nUser: ${ctx.displayName} (${ctx.email}). Admin: ${ctx.isWorkspaceAdmin}. Scope: ${ctx.effectiveOwner}.`;

    while (round < maxRounds && !execState.pendingApproval) {
      round += 1;
      const turn = await this.anthropic.createMessagesWithToolsTurn({
        system: systemPrompt,
        tools: SALES_COPILOT_TOOLS,
        messages,
        maxTokens: 2048,
        featureLabel: 'Sales Copilot',
        provider: 'nvidia',
      });
      resolvedModel = turn.model;
      const content = turn.content ?? [];
      messages.push({ role: 'assistant', content });

      const toolUses = content.filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0 || turn.stop_reason === 'end_turn') {
        finalAnswer = content
          .filter((b) => b.type === 'text')
          .map((b) => String(b.text ?? ''))
          .join('\n')
          .trim();
        break;
      }

      const toolResults: Array<Record<string, unknown>> = [];
      for (const toolUse of toolUses) {
        const name = String(toolUse.name ?? '');
        const id = String(toolUse.id ?? '');
        const input = (toolUse.input ?? {}) as Record<string, unknown>;
        const callEntry: SalesAgentToolCall = { name, input };
        toolsUsed.push(name);

        if (!this.policy.canUseTool(ctx, name)) {
          callEntry.error = 'Permission denied for tool';
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: JSON.stringify({ error: callEntry.error }),
          });
          toolCalls.push(callEntry);
          continue;
        }

        const needsApproval = this.policy.shouldRequireApproval(name, settings, input);
        callEntry.riskTier = this.policy.getToolRisk(name).riskTier;

        if (needsApproval) {
          const recordRef = this.extractApprovalRecord(input);
          const approval = await this.approvalModel.create({
            runId: run._id,
            action: name,
            payload: input,
            riskTier: 'high',
            status: 'pending',
            previewSummary: this.policy.buildPreviewSummary(name, input),
            recordType: recordRef.recordType,
            recordId: recordRef.recordId,
          });
          callEntry.approvalId = String(approval._id);
          callEntry.result = {
            status: 'pending_approval',
            approvalId: String(approval._id),
            preview: approval.previewSummary,
          };
          toolCalls.push(callEntry);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: this.formatToolResultContent(name, callEntry.result),
          });
          execState.pendingApproval = true;
          continue;
        }

        try {
          const result = await this.runTool(name, input, ctx, reqUser, execState);
          callEntry.result = result;
          callEntry.executedAt = new Date().toISOString();
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: this.formatToolResultContent(name, result),
          });
        } catch (err) {
          callEntry.error = err instanceof Error ? err.message : 'Tool failed';
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: JSON.stringify({ error: callEntry.error }),
            is_error: true,
          });
        }
        toolCalls.push(callEntry);
      }

      messages.push({ role: 'user', content: toolResults });
    }

    const sessionId = String(run._id);
    const pendingApprovals = await this.listCopilotPendingApprovals(sessionId);

    if (execState.pendingApproval) {
      finalAnswer =
        finalAnswer ||
        'I prepared an action that needs your approval before it can run. Review the approval card below.';
      await this.runModel.findByIdAndUpdate(run._id, {
        status: 'pending_approval',
        summary: finalAnswer,
        toolCalls,
        toolRoundCount: round,
        model: resolvedModel,
        pausedMessages: messages,
        pausedAtRound: round,
      });
      return {
        answer: finalAnswer,
        sessionId,
        toolsUsed: Array.from(new Set(toolsUsed)),
        model: resolvedModel,
        status: 'pending_approval' as const,
        pendingApprovals,
      };
    }

    if (!finalAnswer) {
      throw new ServiceUnavailableException(
        'Sales Copilot needed too many tool rounds. Try a narrower question.',
      );
    }

    await this.runModel.findByIdAndUpdate(run._id, {
      status: 'completed',
      summary: finalAnswer,
      toolCalls,
      toolRoundCount: round,
      model: resolvedModel,
      pausedMessages: [],
      pausedAtRound: undefined,
    });

    return {
      answer: finalAnswer,
      sessionId,
      toolsUsed: Array.from(new Set(toolsUsed)),
      model: resolvedModel,
      status: 'completed' as const,
      pendingApprovals: [],
    };
  }

  async resumeCopilotSession(sessionId: string, reqUser: any, crmDbUser: any) {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('Session not found');
    }
    const run = await this.runModel.findById(sessionId).exec();
    if (!run || run.trigger !== 'copilot') {
      throw new NotFoundException('Copilot session not found');
    }

    const pendingCount = await this.approvalModel.countDocuments({
      runId: run._id,
      status: 'pending',
    });
    const pendingApprovals = await this.listCopilotPendingApprovals(sessionId);
    if (pendingCount > 0) {
      return {
        answer: run.summary || 'Waiting for approval.',
        sessionId,
        status: 'pending_approval' as const,
        pendingApprovals,
        toolsUsed: [],
        model: run.model || '',
      };
    }

    if (!run.pausedMessages?.length) {
      return {
        answer: run.summary || 'Session complete.',
        sessionId,
        status: (run.status === 'pending_approval' ? 'completed' : run.status) as string,
        pendingApprovals: [],
        toolsUsed: [],
        model: run.model || '',
      };
    }

    const ctx = this.buildUserContext(reqUser, crmDbUser);
    await this.runModel.findByIdAndUpdate(run._id, { status: 'running' });
    await this.executeRun(String(run._id), ctx, reqUser, {
      messages: run.pausedMessages as Array<Record<string, unknown>>,
      startRound: run.pausedAtRound ?? run.toolRoundCount ?? 0,
      toolCalls: [...(run.toolCalls || [])],
    });

    const updated = await this.runModel.findById(sessionId).lean().exec();
    return {
      answer: updated?.summary || 'Done.',
      sessionId,
      status: (updated?.status || 'completed') as string,
      pendingApprovals: await this.listCopilotPendingApprovals(sessionId),
      toolsUsed: [],
      model: updated?.model || '',
    };
  }

  private async resolveCopilotRun(sessionId: string | undefined, ctx: SalesAgentUserContext) {
    if (sessionId && Types.ObjectId.isValid(sessionId)) {
      const existing = await this.runModel.findById(sessionId).exec();
      if (existing?.trigger === 'copilot') {
        if (existing.status === 'pending_approval') {
          throw new BadRequestException(
            'This session is waiting for approval. Approve or reject pending actions, then resume.',
          );
        }
        return existing;
      }
    }
    return this.runModel.create({
      recordType: 'Lead',
      recordId: new Types.ObjectId(),
      agentRole: 'sales',
      status: 'running',
      trigger: 'copilot',
      ownerScope: ctx.effectiveOwner,
      triggeredBy: Types.ObjectId.isValid(ctx.userId)
        ? new Types.ObjectId(ctx.userId)
        : undefined,
      metadata: { copilotSession: true },
      toolCalls: [],
    });
  }

  private async listCopilotPendingApprovals(sessionId: string) {
    if (!Types.ObjectId.isValid(sessionId)) return [];
    return this.approvalModel
      .find({ runId: new Types.ObjectId(sessionId), status: 'pending' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  private extractApprovalRecord(input: Record<string, unknown>): {
    recordType?: SalesAgentRecordType;
    recordId?: Types.ObjectId;
  } {
    if (
      input.recordType &&
      input.recordId &&
      Types.ObjectId.isValid(String(input.recordId))
    ) {
      return {
        recordType: String(input.recordType) as SalesAgentRecordType,
        recordId: new Types.ObjectId(String(input.recordId)),
      };
    }
    if (input.leadId && Types.ObjectId.isValid(String(input.leadId))) {
      return { recordType: 'Lead', recordId: new Types.ObjectId(String(input.leadId)) };
    }
    if (input.entityId && input.module) {
      const mod = String(input.module);
      if (mod === 'leads' && Types.ObjectId.isValid(String(input.entityId))) {
        return { recordType: 'Lead', recordId: new Types.ObjectId(String(input.entityId)) };
      }
      if (mod === 'contacts' && Types.ObjectId.isValid(String(input.entityId))) {
        return { recordType: 'Contact', recordId: new Types.ObjectId(String(input.entityId)) };
      }
    }
    if (input.entityType && input.entityId && Types.ObjectId.isValid(String(input.entityId))) {
      const et = String(input.entityType);
      if (et === 'Lead' || et === 'Contact') {
        return {
          recordType: et as SalesAgentRecordType,
          recordId: new Types.ObjectId(String(input.entityId)),
        };
      }
    }
    return {};
  }

  private canUsePmSearch(ctx: SalesAgentUserContext): boolean {
    const candidates = ['boards:read', 'pm:read', 'wiki:read', 'boards', 'pm', 'wiki'];
    return (
      ctx.isWorkspaceAdmin ||
      candidates.some(
        (c) =>
          ctx.permissions.includes(c) ||
          ctx.permissions.includes(`${c}:read`) ||
          ctx.permissions.includes(c.split(':')[0]),
      )
    );
  }

  async getSettings(): Promise<SalesAgentSettings> {
    let doc = await this.settingsModel.findOne({ key: 'default' }).exec();
    if (!doc) {
      doc = await this.settingsModel.create({ key: 'default' });
    }
    return doc.toObject();
  }

  async updateSettings(dto: UpdateSalesAgentSettingsDto): Promise<SalesAgentSettings> {
    const patch: Record<string, unknown> = { ...dto };
    if (dto.enabledLeadPipelineIds) {
      patch.enabledLeadPipelineIds = dto.enabledLeadPipelineIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
    }
    const doc = await this.settingsModel
      .findOneAndUpdate({ key: 'default' }, { $set: patch }, { upsert: true, new: true })
      .exec();
    return doc!.toObject();
  }

  async listRuns(query: {
    status?: string;
    recordType?: string;
    recordId?: string;
    limit?: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.recordType) filter.recordType = query.recordType;
    if (query.recordId && Types.ObjectId.isValid(query.recordId)) {
      filter.recordId = new Types.ObjectId(query.recordId);
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    return this.runModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean().exec();
  }

  async getRun(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Run not found');
    const run = await this.runModel.findById(id).lean().exec();
    if (!run) throw new NotFoundException('Run not found');
    return run;
  }

  async listApprovals(status: SalesAgentApprovalStatus = 'pending') {
    return this.approvalModel
      .find({ status })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
      .exec();
  }

  async getMetrics(days = 30): Promise<SalesAgentMetrics> {
    const now = new Date();
    const periodDays = Math.min(Math.max(days, 1), 365);
    const periodStart = new Date(now.getTime() - periodDays * 86400000);
    const d7 = new Date(now.getTime() - 7 * 86400000);
    const d30 = new Date(now.getTime() - 30 * 86400000);

    const [
      totalRuns,
      completedRuns,
      failedRuns,
      pendingApprovals,
      approvedActions,
      rejectedActions,
      runsLast7Days,
      runsLast30Days,
      runsInPeriod,
      emailsSentInPeriod,
      runsByTrigger,
      runsByRole,
      approvalsByAction,
      recentRuns,
    ] = await Promise.all([
      this.runModel.countDocuments({}),
      this.runModel.countDocuments({ status: 'completed' }),
      this.runModel.countDocuments({ status: 'failed' }),
      this.approvalModel.countDocuments({ status: 'pending' }),
      this.approvalModel.countDocuments({ status: 'approved' }),
      this.approvalModel.countDocuments({ status: 'rejected' }),
      this.runModel.countDocuments({ createdAt: { $gte: d7 } }),
      this.runModel.countDocuments({ createdAt: { $gte: d30 } }),
      this.runModel.countDocuments({ createdAt: { $gte: periodStart } }),
      this.approvalModel.countDocuments({
        status: 'approved',
        action: { $in: ['send_email', 'send_proposal'] },
        executedAt: { $gte: periodStart },
      }),
      this.runModel.aggregate([
        { $match: { createdAt: { $gte: periodStart } } },
        { $group: { _id: '$trigger', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.runModel.aggregate([
        { $match: { createdAt: { $gte: periodStart } } },
        { $group: { _id: '$agentRole', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.approvalModel.aggregate([
        { $match: { reviewedAt: { $gte: periodStart } } },
        {
          $group: {
            _id: '$action',
            approved: {
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
            },
          },
        },
        { $sort: { approved: -1 } },
      ]),
      this.runModel
        .find({ createdAt: { $gte: periodStart } })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean()
        .exec(),
    ]);

    const decided = approvedActions + rejectedActions;
    return {
      totalRuns,
      completedRuns,
      failedRuns,
      pendingApprovals,
      approvedActions,
      rejectedActions,
      approvalRate: decided ? approvedActions / decided : 0,
      runsLast7Days,
      runsLast30Days,
      runsInPeriod,
      emailsSentInPeriod,
      runsByTrigger: (runsByTrigger as Array<{ _id: string; count: number }>).map((r) => ({
        trigger: r._id || 'unknown',
        count: r.count,
      })),
      runsByRole: (runsByRole as Array<{ _id: string; count: number }>).map((r) => ({
        role: r._id || 'sales',
        count: r.count,
      })),
      approvalsByAction: (
        approvalsByAction as Array<{ _id: string; approved: number; rejected: number }>
      ).map((r) => ({
        action: r._id || 'unknown',
        approved: r.approved,
        rejected: r.rejected,
      })),
      recentRuns: recentRuns.map((r) => ({
        id: String(r._id),
        recordType: r.recordType,
        recordId: String(r.recordId),
        status: r.status,
        trigger: r.trigger,
        agentRole: r.agentRole,
        summary: r.summary,
        createdAt: (r as any).createdAt?.toISOString?.() || (r as any).createdAt,
      })),
    };
  }

  buildUserContext(reqUser: any, crmDbUser: any): SalesAgentUserContext {
    const permissions = this.mergePermissions(reqUser, crmDbUser);
    const isWorkspaceAdmin =
      hasCrmAdminJwtBypass(reqUser) || hasCrmAdminFromDbUser(crmDbUser);
    const displayName =
      `${crmDbUser?.firstName || ''} ${crmDbUser?.lastName || ''}`.trim() ||
      crmDbUser?.email ||
      reqUser?.email ||
      'User';
    const userId = String(reqUser?.userId || reqUser?._id || crmDbUser?._id || '');
    const effectiveOwner = isWorkspaceAdmin ? 'All' : displayName;
    return {
      email: String(reqUser?.email || crmDbUser?.email || ''),
      displayName,
      userId,
      isWorkspaceAdmin,
      effectiveOwner,
      permissions,
    };
  }

  /** Fire-and-forget CRM event hook. */
  handleEvent(event: SalesAgentEvent): void {
    void this.enqueueFromEvent(event).catch((err) =>
      this.logger.warn(`handleEvent failed: ${err instanceof Error ? err.message : err}`),
    );
  }

  private async enqueueFromEvent(event: SalesAgentEvent): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.enabled) return;
    if (!(await this.isRecordEligible(event.recordType, event.recordId, settings, event.trigger))) {
      return;
    }
    if (await this.isInCooldown(event.recordType, event.recordId, settings.cooldownHours)) {
      return;
    }
    await this.startRun({
      recordType: event.recordType,
      recordId: event.recordId,
      trigger: event.trigger,
      user: event.user,
      metadata: event.metadata,
    });
  }

  async triggerManual(
    dto: {
      recordType: SalesAgentRecordType;
      recordId: string;
      agentRole?: SalesAgentRole;
      instructions?: string;
    },
    reqUser: any,
    crmDbUser: any,
  ) {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      throw new BadRequestException('Sales agents are disabled. Enable under CRM Settings → Sales agents.');
    }
    return this.startRun({
      recordType: dto.recordType,
      recordId: dto.recordId,
      trigger: 'manual',
      agentRole: (dto.agentRole as SalesAgentRole) || 'sales',
      user: reqUser,
      metadata: dto.instructions ? { instructions: dto.instructions } : undefined,
      crmDbUser,
    });
  }

  private async startRun(input: {
    recordType: SalesAgentRecordType;
    recordId: string;
    trigger: SalesAgentTrigger;
    agentRole?: SalesAgentRole;
    user?: any;
    crmDbUser?: any;
    metadata?: Record<string, unknown>;
  }) {
    if (!Types.ObjectId.isValid(input.recordId)) {
      throw new BadRequestException('Invalid record id');
    }
    const settings = await this.getSettings();
    const ctx = input.user
      ? this.buildUserContext(input.user, input.crmDbUser)
      : this.systemContext();
    const agentRole =
      input.agentRole ||
      resolveAgentRole(
        input.trigger,
        undefined,
        (settings.defaultAgentRole as SalesAgentRole) || 'sales',
      );
    const run = await this.runModel.create({
      recordType: input.recordType,
      recordId: new Types.ObjectId(input.recordId),
      agentRole,
      status: 'running',
      trigger: input.trigger,
      ownerScope: ctx.effectiveOwner,
      metadata: input.metadata,
      triggeredBy: ctx.userId && Types.ObjectId.isValid(ctx.userId)
        ? new Types.ObjectId(ctx.userId)
        : undefined,
      toolCalls: [],
    });
    void this.executeRun(String(run._id), ctx, input.user).catch(async (err) => {
      await this.runModel.findByIdAndUpdate(run._id, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Run failed',
      });
    });
    return run.toObject();
  }

  private systemContext(): SalesAgentUserContext {
    return {
      email: 'system@mathionix.internal',
      displayName: 'Sales Agent',
      userId: '',
      isWorkspaceAdmin: true,
      effectiveOwner: 'All',
      permissions: ['admin:read', 'leads:write', 'inbox:send'],
    };
  }

  /** Resume a run paused for approval after the last pending action is resolved. */
  async resumeRun(runId: string, reqUser?: any, crmDbUser?: any): Promise<void> {
    const run = await this.runModel.findById(runId).exec();
    if (!run || !run.pausedMessages?.length) return;
    const pending = await this.approvalModel.countDocuments({
      runId: run._id,
      status: 'pending',
    });
    if (pending > 0) return;

    const ctx = reqUser
      ? this.buildUserContext(reqUser, crmDbUser)
      : this.systemContext();
    await this.runModel.findByIdAndUpdate(run._id, { status: 'running' });
    void this.executeRun(String(run._id), ctx, reqUser, {
      messages: run.pausedMessages as Array<Record<string, unknown>>,
      startRound: run.pausedAtRound ?? run.toolRoundCount ?? 0,
      toolCalls: [...(run.toolCalls || [])],
    }).catch(async (err) => {
      await this.runModel.findByIdAndUpdate(run._id, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Resume failed',
      });
    });
  }

  private async executeRun(
    runId: string,
    ctx: SalesAgentUserContext,
    reqUser?: any,
    resume?: {
      messages: Array<Record<string, unknown>>;
      startRound: number;
      toolCalls: SalesAgentToolCall[];
    },
  ) {
    const run = await this.runModel.findById(runId).exec();
    if (!run) return;
    const settings = await this.getSettings();
    const maxRounds = settings.maxToolRounds ?? 12;
    let resolvedModel = run.model || (await this.anthropic.resolveModel());

    const recordLabel = `${run.recordType} ${run.recordId}`;
    const extraInstructions = run.metadata?.instructions
      ? `\n\nRep instructions: ${String(run.metadata.instructions)}`
      : '';
    const triggerNote = `\n\nTrigger: ${run.trigger}. Agent role: ${run.agentRole}. Focus on ${recordLabel}.${extraInstructions}`;

    const messages: Array<Record<string, unknown>> = resume?.messages?.length
      ? [...resume.messages]
      : [
        {
          role: 'user',
          content: `Process sales agent run for ${recordLabel}. Use tools to analyze and take appropriate supervised actions.`,
        },
      ];

    const execState: RunExecutionState = {
      runId: run._id as Types.ObjectId,
      recordType: run.recordType,
      recordId: String(run.recordId),
      settings,
      emailsSentThisRun: 0,
      pendingApproval: false,
    };

    const toolCalls: SalesAgentToolCall[] = resume?.toolCalls ?? [];
    let round = resume?.startRound ?? 0;
    let finalSummary = '';

    const systemPrompt = buildSystemPrompt(
      run.agentRole as SalesAgentRole,
      `\n\nCurrent user: ${ctx.displayName} (${ctx.email}). Workspace admin: ${ctx.isWorkspaceAdmin}.${triggerNote}`,
    );
    const tools =
      run.trigger === 'copilot' ? SALES_COPILOT_TOOLS : SALES_AGENT_TOOLS;
    const activeSystemPrompt =
      run.trigger === 'copilot'
        ? `${SALES_COPILOT_SYSTEM_PROMPT}\n\nCurrent user: ${ctx.displayName} (${ctx.email}). Workspace admin: ${ctx.isWorkspaceAdmin}.${triggerNote}`
        : systemPrompt;

    while (round < maxRounds && !execState.pendingApproval) {
      round += 1;
      const turn = await this.anthropic.createMessagesWithToolsTurn({
        system: activeSystemPrompt,
        tools,
        messages,
        maxTokens: run.trigger === 'copilot' ? 2048 : 4096,
        featureLabel: run.trigger === 'copilot' ? 'Sales Copilot' : 'Sales Agent',
      });
      resolvedModel = turn.model;
      const content = turn.content ?? [];
      messages.push({ role: 'assistant', content });

      const toolUses = content.filter((b) => b.type === 'tool_use');
      if (toolUses.length === 0 || turn.stop_reason === 'end_turn') {
        finalSummary = content
          .filter((b) => b.type === 'text')
          .map((b) => String(b.text ?? ''))
          .join('\n')
          .trim();
        break;
      }

      const toolResults: Array<Record<string, unknown>> = [];
      for (const toolUse of toolUses) {
        const name = String(toolUse.name ?? '');
        const id = String(toolUse.id ?? '');
        const input = (toolUse.input ?? {}) as Record<string, unknown>;
        const callEntry: SalesAgentToolCall = { name, input };

        if (!this.policy.canUseTool(ctx, name)) {
          callEntry.error = 'Permission denied for tool';
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: JSON.stringify({ error: callEntry.error }),
          });
          toolCalls.push(callEntry);
          continue;
        }

        const needsApproval = this.policy.shouldRequireApproval(name, settings, input);
        callEntry.riskTier = this.policy.getToolRisk(name).riskTier;

        if (needsApproval) {
          const recordRef = this.extractApprovalRecord(input);
          const approval = await this.approvalModel.create({
            runId: run._id,
            action: name,
            payload: input,
            riskTier: 'high',
            status: 'pending',
            previewSummary: this.policy.buildPreviewSummary(name, input),
            recordType: recordRef.recordType ?? run.recordType,
            recordId: recordRef.recordId ?? run.recordId,
          });
          callEntry.approvalId = String(approval._id);
          callEntry.result = {
            status: 'pending_approval',
            approvalId: String(approval._id),
            preview: approval.previewSummary,
          };
          toolCalls.push(callEntry);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: this.formatToolResultContent(name, callEntry.result),
          });
          execState.pendingApproval = true;
          await this.auditLog.logAction({
            user: ctx.userId || '000000000000000000000000',
            action: 'sales_agent_approval_queued',
            module: 'sales-agent',
            entityId: String(run._id),
            description: `${name} queued for approval`,
            changes: { action: name, payload: input },
          });
          continue;
        }

        try {
          const result = await this.runTool(name, input, ctx, reqUser, execState);
          callEntry.result = result;
          callEntry.executedAt = new Date().toISOString();
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: this.formatToolResultContent(name, result),
          });
          await this.auditLog.logAction({
            user: ctx.userId || '000000000000000000000000',
            action: 'sales_agent_tool_executed',
            module: 'sales-agent',
            entityId: String(run._id),
            description: `Agent executed ${name}`,
            changes: { input, result },
          });
        } catch (err) {
          callEntry.error = err instanceof Error ? err.message : 'Tool failed';
          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: JSON.stringify({ error: callEntry.error }),
            is_error: true,
          });
        }
        toolCalls.push(callEntry);
      }

      messages.push({ role: 'user', content: toolResults });
      await this.runModel.findByIdAndUpdate(run._id, {
        toolCalls,
        toolRoundCount: round,
        model: resolvedModel,
      });

      if (execState.pendingApproval) {
        await this.runModel.findByIdAndUpdate(run._id, {
          pausedMessages: messages,
          pausedAtRound: round,
          status: 'pending_approval',
        });
        break;
      }
    }

    if (execState.pendingApproval) {
      await this.runModel.findByIdAndUpdate(run._id, {
        summary: finalSummary || 'Awaiting approval',
        reasoning: finalSummary,
        toolCalls,
        toolRoundCount: round,
        model: resolvedModel,
      });
      if (run.trigger !== 'copilot') {
        await this.updateAgentMemory(run.recordType, String(run.recordId), {
          lastRunId: String(run._id),
          summary: finalSummary || 'Awaiting approval',
          status: 'pending_approval',
          pendingApprovals: true,
          updatedAt: new Date().toISOString(),
        });
      }
      return;
    }

    const status = 'completed';
    await this.runModel.findByIdAndUpdate(run._id, {
      status,
      summary: finalSummary || 'Completed',
      reasoning: finalSummary,
      toolCalls,
      toolRoundCount: round,
      model: resolvedModel,
      pausedMessages: [],
      pausedAtRound: undefined,
    });

    if (run.trigger !== 'copilot') {
      await this.updateAgentMemory(run.recordType, String(run.recordId), {
        lastRunId: String(run._id),
        summary: finalSummary,
        status,
        pendingApprovals: execState.pendingApproval,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async approveAction(approvalId: string, reqUser: any, crmDbUser: any) {
    const approval = await this.approvalModel.findById(approvalId).exec();
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.status !== 'pending') {
      throw new BadRequestException('Approval already decided');
    }
    const ctx = this.buildUserContext(reqUser, crmDbUser);
    const settings = await this.getSettings();
    const execState: RunExecutionState = {
      runId: approval.runId as Types.ObjectId,
      recordType: approval.recordType || 'Lead',
      recordId: String(approval.recordId || ''),
      settings,
      emailsSentThisRun: 0,
      pendingApproval: false,
    };

    try {
      const result = await this.runTool(
        approval.action,
        approval.payload as Record<string, unknown>,
        ctx,
        reqUser,
        execState,
        true,
      );
      approval.status = 'approved';
      approval.reviewedBy = Types.ObjectId.isValid(ctx.userId)
        ? new Types.ObjectId(ctx.userId)
        : undefined;
      approval.reviewedAt = new Date();
      approval.executedAt = new Date();
      approval.executionResult = result as Record<string, unknown>;
      await approval.save();

      const run = await this.runModel.findById(approval.runId).exec();
      if (run) {
        const calls = [...(run.toolCalls || [])];
        const idx = calls.findIndex((c) => c.approvalId === approvalId);
        if (idx >= 0) {
          calls[idx] = {
            ...calls[idx],
            result,
            executedAt: new Date().toISOString(),
          };
        }
        const pending = await this.approvalModel.countDocuments({
          runId: run._id,
          status: 'pending',
        });
        await this.runModel.findByIdAndUpdate(run._id, {
          toolCalls: calls,
          status: pending > 0 ? 'pending_approval' : 'completed',
        });

        const settings = await this.getSettings();
        if (pending === 0 && settings.resumeAfterApproval !== false && run?.trigger !== 'copilot') {
          void this.resumeRun(String(run._id), reqUser, crmDbUser);
        }
      }

      await this.auditLog.logAction({
        user: ctx.userId,
        action: 'sales_agent_approval_approved',
        module: 'sales-agent',
        entityId: approvalId,
        description: `Approved ${approval.action}`,
      });

      return { ok: true, result };
    } catch (err) {
      approval.executionError = err instanceof Error ? err.message : 'Execution failed';
      await approval.save();
      throw err;
    }
  }

  async rejectAction(approvalId: string, reviewNote: string | undefined, reqUser: any, crmDbUser: any) {
    const approval = await this.approvalModel.findById(approvalId).exec();
    if (!approval) throw new NotFoundException('Approval not found');
    if (approval.status !== 'pending') {
      throw new BadRequestException('Approval already decided');
    }
    const ctx = this.buildUserContext(reqUser, crmDbUser);
    approval.status = 'rejected';
    approval.reviewedBy = Types.ObjectId.isValid(ctx.userId)
      ? new Types.ObjectId(ctx.userId)
      : undefined;
    approval.reviewedAt = new Date();
    approval.reviewNote = reviewNote?.trim() || undefined;
    await approval.save();

    const pending = await this.approvalModel.countDocuments({
      runId: approval.runId,
      status: 'pending',
    });
    if (pending === 0) {
      await this.runModel.findByIdAndUpdate(approval.runId, { status: 'completed' });
    }

    await this.auditLog.logAction({
      user: ctx.userId,
      action: 'sales_agent_approval_rejected',
      module: 'sales-agent',
      entityId: approvalId,
      description: reviewNote || `Rejected ${approval.action}`,
    });

    return { ok: true };
  }

  private async runTool(
    name: string,
    input: Record<string, unknown>,
    ctx: SalesAgentUserContext,
    reqUser: any,
    execState: RunExecutionState,
    fromApproval = false,
  ): Promise<unknown> {
    const owner = ctx.effectiveOwner === 'All' ? undefined : ctx.effectiveOwner;

    switch (name) {
      case 'crm_search': {
        const query = String(input.query ?? '').trim();
        if (query.length < 2) return { error: 'Query too short' };
        const data = await this.globalSearch.search(query, { full: true });
        return summarizeSearchSlice(data as Record<string, unknown>);
      }
      case 'crm_sales_attention':
        return this.trimPayload(await this.reporting.getSalesAttention(owner));
      case 'crm_dashboard': {
        const days = Math.min(Math.max(Number(input.days) || 30, 1), 365);
        return this.trimPayload(await this.reporting.getDashboardData(days, owner));
      }
      case 'crm_workspace': {
        const window = input.window ? String(input.window) : undefined;
        return this.trimPayload(
          await this.crmService.getSalesWorkspace(
            ctx.isWorkspaceAdmin ? undefined : owner,
            reqUser,
            window,
            'attention,tasks,activity,leads',
          ),
        );
      }
      case 'pm_search': {
        return { error: 'PM search is not available in CRM-only mode.' };
      }
      case 'get_lead': {
        const lead = await this.crmService.findOneLead(String(input.leadId), reqUser);
        return lead ? this.trimPayload(lead) : { error: 'Lead not found' };
      }
      case 'get_record_context':
        return this.getRecordContext(
          String(input.recordType) as SalesAgentRecordType,
          String(input.recordId),
          reqUser,
        );
      case 'draft_outreach_email':
        return this.crmAi.draftPersonOutreachEmail(
          reqUser,
          input.module as 'leads' | 'contacts',
          String(input.entityId),
          input.instructions ? String(input.instructions) : undefined,
        );
      case 'draft_inbox_reply':
        return this.crmAi.draftInboxFollowUpReplyEmail(
          reqUser,
          String(input.inboxEmailId),
          input.instructions ? String(input.instructions) : undefined,
        );
      case 'draft_proposal':
        return this.crmAi.draftProposalFromRecord(reqUser, input.module as any, String(input.entityId), {
          kind: (input.kind as 'proposal' | 'quotation') || 'proposal',
          instructions: input.instructions ? String(input.instructions) : undefined,
        });
      case 'draft_contract':
        return this.crmAi.draftContractFromRecord(reqUser, input.module as any, String(input.entityId), {
          instructions: input.instructions ? String(input.instructions) : undefined,
        });
      case 'create_task': {
        const act = await this.crmService.createActivity(
          {
            type: 'Task',
            title: String(input.title),
            content: input.content ? String(input.content) : '',
            relatedTo: input.recordId,
            relatedType: input.recordType,
            dueDate: input.dueDate ? new Date(String(input.dueDate)) : undefined,
            status: 'Open',
          },
          reqUser,
        );
        return { activityId: String((act as any)._id), title: input.title };
      }
      case 'create_note': {
        const act = await this.crmService.createActivity(
          {
            type: 'Note',
            title: input.title ? String(input.title) : 'Sales Agent note',
            content: String(input.content),
            relatedTo: input.recordId,
            relatedType: input.recordType,
          },
          reqUser,
        );
        return { activityId: String((act as any)._id) };
      }
      case 'update_lead_stage': {
        const lead = await this.crmService.updateLead(
          String(input.leadId),
          { stage: String(input.stageName) },
          reqUser,
        );
        return lead ? { ok: true, stage: input.stageName } : { error: 'Update failed' };
      }
      case 'enroll_workflow':
        return this.workflowsService.enrollInWorkflow(
          String(input.workflowId),
          {
            entityType: input.entityType as 'Lead' | 'Contact',
            entityId: String(input.entityId),
          },
          reqUser,
        );
      case 'send_email':
      case 'send_proposal':
        return this.executeSendEmail(input, ctx, reqUser, execState, fromApproval);
      case 'convert_lead':
        return this.crmService.convertLead(
          String(input.leadId),
          {
            type: input.type as 'contact' | 'organization' | 'client',
            pipelineId: input.pipelineId ? String(input.pipelineId) : undefined,
            stage: input.stage ? String(input.stage) : undefined,
          },
          reqUser,
        );
      case 'assign_owner': {
        const patch = { leadOwner: String(input.ownerName) };
        const lead = await this.crmService.updateLead(String(input.recordId), patch, reqUser);
        return lead ? { ok: true } : { error: 'Update failed' };
      }
      case 'list_pipelines': {
        const pipelineType = input.type
          ? (String(input.type) as 'leads')
          : undefined;
        const pipelines = await this.pipelinesService.findAll(pipelineType);
        return this.trimPayload(pipelines);
      }
      case 'list_workflows': {
        const all = await this.workflowsService.findAll();
        const entityType = input.entityType ? String(input.entityType) : '';
        const filtered = entityType
          ? all.filter(
            (w: any) =>
              w.enabled !== false &&
              (!w.entityType || w.entityType === entityType || w.entityType === 'Any'),
          )
          : all.filter((w: any) => w.enabled !== false);
        return filtered.slice(0, 30).map((w: any) => ({
          id: String(w._id),
          name: w.name,
          trigger: w.trigger,
          entityType: w.entityType,
        }));
      }
      case 'list_inbox_accounts': {
        const userId = ctx.userId || String(reqUser?.userId || reqUser?._id || '');
        if (!userId) return { error: 'User context required' };
        const accounts = await this.inboxAccounts.listAccountsForUser(userId, ctx.email);
        return accounts.map((a) => ({
          id: String(a._id),
          email: a.email,
          displayName: a.displayName,
          isDefault: a.isDefault,
          provider: a.provider,
        }));
      }
      case 'get_email_thread': {
        const limit = Math.min(Number(input.limit) || 15, 30);
        const rows = await this.emailTracking.getTrackingByEntity(
          String(input.entityId),
          String(input.module),
        );
        return rows.slice(0, limit).map((r: any) => ({
          id: String(r._id),
          recipient: r.recipient,
          subject: r.subject,
          createdAt: r.createdAt,
          openCount: r.openCount,
          lastOpenedAt: r.lastOpenedAt,
          repliedAt: r.repliedAt,
        }));
      }
      case 'schedule_call': {
        const act = await this.crmService.createActivity(
          {
            type: 'Call',
            title: String(input.title),
            content: input.content ? String(input.content) : '',
            relatedTo: input.recordId,
            relatedType: input.recordType,
            dueDate: input.dueDate ? new Date(String(input.dueDate)) : undefined,
            status: 'Open',
          },
          reqUser,
        );
        return { activityId: String((act as any)._id), title: input.title };
      }
      case 'extract_website_emails': {
        const url = String(input.url ?? '').trim();
        if (!url) return { error: 'url is required' };
        const result = await this.websiteEmailExtractor.extractFromWebsite(url, {
          crawlContactPages: input.crawlContactPages !== false,
        });
        return this.trimPayload({
          url: result.url,
          title: result.title,
          emails: result.emails.map((hit) => ({
            email: hit.email,
            source: hit.source,
            pageUrl: hit.pageUrl,
          })),
          pagesScanned: result.pagesScanned,
          count: result.emails.length,
        });
      }
      case 'create_lead': {
        const firstName = String(input.firstName ?? '').trim();
        if (!firstName) return { error: 'firstName is required' };
        const email = input.email ? String(input.email).trim() : '';
        if (email && email.includes('@')) {
          const existing = await this.leadModel
            .findOne({ email: this.leadEmailRegex(email) })
            .select('_id firstName lastName email organization')
            .lean()
            .exec();
          if (existing) {
            const existingId = String(existing._id);
            return {
              error: 'duplicate',
              message: 'A lead with this email already exists',
              existingLeadId: existingId,
              name: `${existing.firstName || ''} ${existing.lastName || ''}`.trim(),
              email: existing.email,
              organization: existing.organization,
              link: `/crm/leads/${existingId}`,
            };
          }
        }
        const dto: Record<string, unknown> = { firstName };
        const lastName = input.lastName ? String(input.lastName).trim() : '';
        if (lastName) dto.lastName = lastName;
        if (email) dto.email = email;
        const organization = input.organization ? String(input.organization).trim() : '';
        if (organization) dto.organization = organization;
        if (input.phone) dto.phone = String(input.phone).trim();
        if (input.mobileNo) dto.mobileNo = String(input.mobileNo).trim();
        if (input.jobTitle) dto.jobTitle = String(input.jobTitle).trim();
        dto.source = input.source ? String(input.source).trim() : 'Sales Copilot';
        if (input.pipelineId && Types.ObjectId.isValid(String(input.pipelineId))) {
          dto.pipeline = String(input.pipelineId);
        }
        if (input.stage) dto.stage = String(input.stage).trim();
        const lead = await this.crmService.createLead(dto, reqUser);
        const leadId = String((lead as any)._id);
        const notes = input.notes ? String(input.notes).trim() : '';
        if (notes) {
          await this.crmService.createActivity(
            {
              type: 'Note',
              title: 'Lead created via Sales Copilot',
              content: notes,
              relatedTo: leadId,
              relatedType: 'Lead',
            },
            reqUser,
          );
        }
        return {
          ok: true,
          leadId,
          recordId: (lead as any).recordId,
          name: `${firstName}${lastName ? ` ${lastName}` : ''}`,
          email: email || undefined,
          organization: organization || undefined,
          link: `/crm/leads/${leadId}`,
        };
      }
      case 'get_upcoming_follow_ups': {
        const ownerKey = ctx.effectiveOwner === 'All' ? 'All' : ctx.effectiveOwner;
        const scopedAuthorId = ctx.isWorkspaceAdmin
          ? null
          : Types.ObjectId.isValid(ctx.userId)
            ? new Types.ObjectId(ctx.userId)
            : null;
        const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 50);
        const daysAhead = Math.min(Math.max(Number(input.daysAhead) || 30, 1), 90);
        return this.trimPayload(
          await this.reporting.getUpcomingFollowUpsForSalesWorkspace(
            ownerKey,
            undefined,
            scopedAuthorId,
            { limit, daysAhead },
          ),
        );
      }
      case 'start_follow_up_sequence': {
        const entityType = String(input.entityType ?? '');
        if (entityType !== 'Lead' && entityType !== 'Contact') {
          return { error: 'entityType must be Lead or Contact' };
        }
        const entityId = String(input.entityId ?? '').trim();
        if (!Types.ObjectId.isValid(entityId)) {
          return { error: 'Invalid entityId' };
        }
        const rawSteps = Array.isArray(input.steps) ? input.steps : [];
        if (!rawSteps.length) return { error: 'At least one follow-up step is required' };
        const defaultInbox = input.inboxAccountId
          ? String(input.inboxAccountId)
          : undefined;
        const steps = rawSteps.map((step: Record<string, unknown>) => {
          const row: Record<string, unknown> = {
            delayDays: Math.max(Number(step.delayDays) || 3, 1),
          };
          const stepInbox = step.inboxAccountId
            ? String(step.inboxAccountId)
            : defaultInbox;
          if (stepInbox) row.inboxAccountId = stepInbox;
          const email = step.email as Record<string, unknown> | undefined;
          if (email?.subject && (email.bodyHtml || email.body)) {
            row.email = {
              sendMode: 'custom',
              subject: String(email.subject).trim(),
              body: String(email.bodyHtml || email.body),
              ...(stepInbox ? { inboxAccountId: stepInbox } : {}),
            };
          }
          const task = step.task as Record<string, unknown> | undefined;
          if (task?.title) {
            row.task = {
              title: String(task.title).trim(),
              body: task.body ? String(task.body) : undefined,
              dueInDays: task.dueInDays != null ? Number(task.dueInDays) : undefined,
            };
          }
          return row;
        });
        return this.workflowsService.startFollowUpSequence(
          {
            entityType: entityType as 'Lead' | 'Contact',
            entityId,
            inboxAccountId: defaultInbox,
            cancelOnReply: input.cancelOnReply !== false,
            steps: steps as any,
          },
          reqUser,
        );
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  private async executeSendEmail(
    input: Record<string, unknown>,
    ctx: SalesAgentUserContext,
    reqUser: any,
    execState: RunExecutionState,
    fromApproval: boolean,
  ) {
    if (!fromApproval && execState.pendingApproval) {
      return { error: 'Already pending approval' };
    }
    const settings = execState.settings;
    if (execState.emailsSentThisRun >= (settings.maxEmailsPerRun ?? 5)) {
      return { error: 'Max emails per run reached' };
    }
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sentToday = await this.approvalModel.countDocuments({
      action: { $in: ['send_email', 'send_proposal'] },
      status: 'approved',
      executedAt: { $gte: todayStart },
    });
    if (sentToday >= (settings.maxEmailsPerDay ?? 20)) {
      return { error: 'Daily agent email cap reached' };
    }

    const userId = ctx.userId || String(reqUser?.userId || reqUser?._id || '');
    if (!userId) return { error: 'User context required to send email' };

    const result = await this.inboxAccounts.sendFromAccount(
      userId,
      String(input.accountId),
      {
        to: String(input.to),
        subject: String(input.subject),
        body: String(input.bodyHtml),
        module: input.module ? String(input.module) : undefined,
        entityId: input.entityId ? String(input.entityId) : undefined,
        replyToInboxEmailId: input.replyToInboxEmailId
          ? String(input.replyToInboxEmailId)
          : undefined,
        systemBypassAuth: !reqUser,
      },
      ctx.email,
    );
    if (result.success) {
      execState.emailsSentThisRun += 1;
    }
    return result;
  }

  private async getRecordContext(
    recordType: SalesAgentRecordType,
    recordId: string,
    reqUser: any,
  ) {
    let record: Record<string, unknown> | null = null;
    let agentContext: unknown = null;
    if (recordType === 'Lead') {
      const lead = await this.leadModel.findById(recordId).lean().exec();
      record = lead as Record<string, unknown> | null;
      agentContext = (lead as any)?.agentContext;
    }

    const modMap: Record<string, 'leads' | 'contacts'> = {
      Lead: 'leads',
      Contact: 'contacts',
    };
    const mod = modMap[recordType];
    const engagement = mod
      ? await this.emailTracking.summarizeEngagementForCrmRecord(recordId, mod)
      : null;

    const activities = (await this.crmService.findActivities(
      recordId,
      undefined,
      undefined,
      recordType,
    )).slice(0, 10);

    const recentRuns = await this.runModel
      .find({ recordType, recordId: new Types.ObjectId(recordId) })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean()
      .exec();

    return this.trimPayload({
      record: record
        ? {
          id: recordId,
          type: recordType,
          stage: record.stage,
          pipeline: record.pipeline,
          email: record.email,
          leadOwner: record.leadOwner,
          value: record.value,
        }
        : null,
      agentContext,
      emailEngagement: engagement,
      recentActivities: activities,
      recentAgentRuns: recentRuns.map((r) => ({
        id: String(r._id),
        status: r.status,
        trigger: r.trigger,
        summary: r.summary,
        createdAt: (r as any).createdAt,
      })),
    });
  }

  async updateAgentMemory(
    recordType: SalesAgentRecordType,
    recordId: string,
    memory: Record<string, unknown>,
  ) {
    if (!Types.ObjectId.isValid(recordId)) return;
    const patch = { agentContext: memory };
    if (recordType === 'Lead') {
      await this.leadModel.findByIdAndUpdate(recordId, { $set: patch }).exec();
    }
  }

  async scanAndEnqueueFromSalesAttention(): Promise<number> {
    const settings = await this.getSettings();
    if (!settings.enabled || !settings.cronEnabled) return 0;
    const attention = await this.reporting.getSalesAttention();
    const enqueued = new Set<string>();
    let count = 0;
    const max = settings.maxRunsPerCronTick ?? 10;

    const candidates: Array<{ recordType: SalesAgentRecordType; recordId: string; trigger: SalesAgentTrigger }> = [];

    if (settings.triggerOnNeverContacted) {
      for (const l of attention.neverContactedLeads || []) {
        candidates.push({ recordType: 'Lead', recordId: l.id, trigger: 'cron' });
      }
    }
    if (settings.triggerOnReplyAwaiting) {
      for (const r of attention.repliesAwaitingResponse || []) {
        if (r.module === 'leads' && r.entityId) {
          candidates.push({
            recordType: 'Lead',
            recordId: r.entityId,
            trigger: 'email_reply_received',
          });
        }
      }
    }
    if (settings.triggerOnStaleLeads) {
      for (const l of attention.staleLeads || []) {
        candidates.push({
          recordType: 'Lead',
          recordId: l.id,
          trigger: 'stale_lead',
        });
      }
    }

    for (const c of candidates) {
      if (count >= max) break;
      const key = `${c.recordType}:${c.recordId}`;
      if (enqueued.has(key)) continue;
      if (!(await this.isRecordEligible(c.recordType, c.recordId, settings, c.trigger))) continue;
      if (await this.isInCooldown(c.recordType, c.recordId, settings.cooldownHours)) continue;
      enqueued.add(key);
      await this.startRun({
        recordType: c.recordType,
        recordId: c.recordId,
        trigger: c.trigger,
      });
      count += 1;
    }
    return count;
  }

  private async isRecordEligible(
    recordType: SalesAgentRecordType,
    recordId: string,
    settings: SalesAgentSettings,
    trigger: SalesAgentTrigger,
  ): Promise<boolean> {
    if (trigger === 'lead_created' && !settings.triggerOnLeadCreated) return false;
    if (trigger === 'email_reply_received' && !settings.triggerOnEmailReply) return false;
    if (trigger === 'website_inbound' && !settings.triggerOnWebsiteInbound) return false;
    if (trigger === 'chat_inbound' && !settings.triggerOnChatInbound) return false;
    if (trigger === 'stale_lead' && !settings.triggerOnStaleLeads) return false;

    if (recordType === 'Lead' && settings.enabledLeadPipelineIds?.length) {
      const lead = await this.leadModel.findById(recordId).select('pipeline converted').lean().exec();
      if (!lead || lead.converted) return false;
      const pid = String((lead as any).pipeline || '');
      if (pid && !settings.enabledLeadPipelineIds.some((p) => String(p) === pid)) {
        return false;
      }
    }
    return true;
  }

  private async isInCooldown(
    recordType: SalesAgentRecordType,
    recordId: string,
    cooldownHours: number,
  ): Promise<boolean> {
    const since = new Date(Date.now() - cooldownHours * 3600000);
    const recent = await this.runModel
      .findOne({
        recordType,
        recordId: new Types.ObjectId(recordId),
        createdAt: { $gte: since },
        status: { $nin: ['failed', 'cancelled'] },
      })
      .select('_id')
      .lean()
      .exec();
    return !!recent;
  }

  private mergePermissions(reqUser: any, crmDbUser: any): string[] {
    const userRole = crmDbUser?.roleId as any;
    const dbRolePermissions =
      userRole?.permissions
        ?.map((p: any) => (typeof p === 'string' ? p : p?.name || p?.key))
        .filter(Boolean) || [];
    const jwtCrm = Array.isArray(reqUser?.crmPermissions) ? reqUser.crmPermissions : [];
    const jwtHrms = Array.isArray(reqUser?.permissions) ? reqUser.permissions : [];
    return Array.from(
      new Set([
        ...dbRolePermissions,
        ...jwtCrm,
        ...jwtHrms,
        ...(crmDbUser?.permissions || []),
      ]),
    );
  }

  private leadEmailRegex(email: string): RegExp {
    const escaped = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
  }

  private formatToolResultContent(toolName: string, result: unknown): string {
    const trimmed = this.trimToolResultForModel(toolName, result);
    let json = JSON.stringify(trimmed ?? result);
    const maxLen = toolName.startsWith('draft_') ? 6000 : 8000;
    if (json.length > maxLen) {
      json = `${json.slice(0, maxLen)}…`;
    }
    return json;
  }

  private trimToolResultForModel(toolName: string, result: unknown): unknown {
    if (result == null || typeof result !== 'object') return result;
    const row = result as Record<string, unknown>;

    if (toolName === 'crm_workspace' || toolName === 'crm_dashboard') {
      return this.trimPayload(result, 0, 15);
    }

    if (toolName === 'crm_sales_attention') {
      const slim = this.trimPayload(result, 0, 12) as Record<string, unknown>;
      for (const key of [
        'neverContactedLeads',
        'staleLeads',
        'unopenedTrackedEmails',
        'replyReceivedEmails',
      ]) {
        if (Array.isArray(slim[key])) slim[key] = (slim[key] as unknown[]).slice(0, 10);
      }
      return slim;
    }

    if (toolName === 'get_record_context') {
      const slim = this.trimPayload(result, 0, 12) as Record<string, unknown>;
      if (Array.isArray(slim.recentActivities)) {
        slim.recentActivities = slim.recentActivities.slice(0, 5);
      }
      return slim;
    }

    if (toolName === 'get_upcoming_follow_ups' && Array.isArray(row.items)) {
      return { ...row, items: (row.items as unknown[]).slice(0, 20) };
    }

    if (toolName.startsWith('draft_')) {
      const body = row.bodyHtml ?? row.body ?? row.html;
      if (typeof body === 'string' && body.length > 12000) {
        return {
          ...row,
          bodyHtml: body.slice(0, 12000),
          bodyHtmlTruncated: true,
        };
      }
      return row;
    }

    return this.trimPayload(result);
  }

  private trimPayload(value: unknown, depth = 0, maxArray = 25): unknown {
    if (value == null || depth > 4) return value;
    if (Array.isArray(value)) {
      return value.slice(0, maxArray).map((v) => this.trimPayload(v, depth + 1, maxArray));
    }
    if (typeof value !== 'object') {
      if (typeof value === 'string' && value.length > 1200) {
        return `${value.slice(0, 1200)}…`;
      }
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (k.startsWith('__')) continue;
      out[k] = this.trimPayload(v, depth + 1, maxArray);
    }
    return out;
  }
}
