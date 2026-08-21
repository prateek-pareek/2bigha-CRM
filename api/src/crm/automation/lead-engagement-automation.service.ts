import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  LeadEngagementAutomationTemplate,
  LeadEngagementAutomationTemplateDocument,
  LeadEngagementAutoFollowUp,
  LeadEngagementAutoOutreach,
  LeadEngagementAutomationRules,
  LeadEngagementRuleExtras,
  LeadEngagementStageTarget,
  LeadEngagementTaskAction,
  LeadStageConditionRule,
} from '../schemas/lead-engagement-automation-template.schema';
import { CrmAiService } from '../ai/crm-ai.service';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';
import {
  type OutreachContextFieldKey,
  type PipelineOutreachAiContext,
} from '../shared/crm-outreach-context.util';
import { EmailTemplatesService } from '../email/email-templates.service';
import { EmailTemplateMergeService } from '../email/email-template-merge.service';
import { LEAD_ENGAGEMENT_SYSTEM_PRESETS } from './lead-engagement-automation-presets';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import { TeamsBotService } from '../../teams-bot/teams-bot.service';
import {
  WorkflowsService,
  type FollowUpSequenceStepDto,
} from './workflows.service';
import { PipelinesService } from '../core/pipelines.service';
import { CrmEmailEngagementBatchService } from '../email/crm-email-engagement-batch.service';
import {
  WorkflowDelayedJob,
  WorkflowDelayedJobDocument,
} from '../schemas/workflow-delayed-job.schema';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';

export const DEFAULT_LEAD_ENGAGEMENT_TEMPLATE_NAME =
  'Outreach — open, reply & follow-ups';

export const DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS = [2, 5, 7, 15, 30];

export const DEFAULT_LEAD_ENGAGEMENT_RULES: LeadEngagementAutomationRules = {
  onEmailOpened: { stageName: 'Contacted', syncContact: true },
  onReply: {
    pipelineName: 'Potential Leads',
    stageNameInTargetPipeline: 'Potential Leads',
  },
  onFollowUpSent: { stageNamePattern: 'FOLLOW-UP {n}' },
  onFollowUpSequenceComplete: { stageName: 'EMAIL/MESSAGE NOT OPENED' },
};

export const DEFAULT_AUTO_FOLLOW_UP: LeadEngagementAutoFollowUp = {
  enabled: false,
  cadenceDays: [...DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS],
  cancelOnReply: true,
};

export type LeadAutomationRunReason =
  | 'stage_rule'
  | 'email_open'
  | 'reply'
  | 'none';

export type LeadAutomationRunItemResult = {
  leadId: string;
  leadName?: string;
  currentStage?: string;
  moved: boolean;
  reason: LeadAutomationRunReason;
  ruleLabel?: string;
  newStage?: string;
  targetPipelineName?: string;
  error?: string;
};

export type LeadAutomationBulkRunResult = {
  processed: number;
  moved: number;
  dryRun?: boolean;
  results: LeadAutomationRunItemResult[];
};

export type LeadEngagementRuleToggles = {
  onEmailOpened?: boolean;
  onReply?: boolean;
  onFollowUpSent?: boolean;
  onFollowUpSequenceComplete?: boolean;
  stageRules?: Record<string, boolean>;
};

const MAX_AUTOMATION_BATCH = 500;

function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function ruleEnabled(extras?: { enabled?: boolean }): boolean {
  return extras?.enabled !== false;
}

function leadDisplayName(lead: Lead): string {
  const name = [lead.firstName, lead.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || String(lead.email || '').trim() || lead.organization || 'Lead';
}

function stageMatches(pipeline: Pipeline, stageName: string): string | null {
  const want = normName(stageName);
  if (!want) return null;
  for (const st of pipeline.stages || []) {
    const n = normName(st.name);
    if (n === want || n.includes(want) || want.includes(n)) {
      return st.name;
    }
  }
  return null;
}

/** Resolve FOLLOW-UP {n} (or similar) to a real stage on the lead's pipeline. */
function stageForFollowUpPattern(
  pipeline: Pipeline,
  pattern: string,
  stepNumber: number,
): string | null {
  const literal = pattern.replace(/\{n\}/gi, String(stepNumber));
  const direct = stageMatches(pipeline, literal);
  if (direct) return direct;

  const base = normName(pattern.replace(/\{n\}/gi, ''));
  const stages = pipeline.stages || [];

  for (const st of stages) {
    const m = String(st.name || '').match(/(\d+)\s*$/);
    if (!m || Number(m[1]) !== stepNumber) continue;
    const prefix = normName(String(st.name).replace(/\d+\s*$/, ''));
    if (!base || prefix.includes(base) || base.includes(prefix)) {
      return st.name;
    }
  }

  for (const st of stages) {
    const m = String(st.name || '').match(/(\d+)\s*$/);
    if (m && Number(m[1]) === stepNumber) {
      return st.name;
    }
  }

  return null;
}

function leadFieldString(lead: Record<string, unknown>, field: string): string {
  const raw = lead[field];
  if (raw == null) return '';
  if (typeof raw === 'object' && raw !== null && '_id' in (raw as object)) {
    return String((raw as { _id?: unknown })._id ?? '');
  }
  return String(raw).trim();
}

function evaluateLeadStageCondition(
  lead: Record<string, unknown>,
  rule: LeadStageConditionRule,
  pipeline?: Pipeline,
): boolean {
  const field = String(rule.field || '').trim();
  if (!field) return false;
  const op = rule.operator || 'equals';
  const actual = leadFieldString(lead, field);
  const expected = String(rule.value ?? '').trim();
  const isStageField = field === 'stage' || field === 'status';

  const resolveExpectedStage = (hint: string): string => {
    if (!hint.trim()) return hint;
    if (pipeline && isStageField) {
      return stageMatches(pipeline, hint) || hint;
    }
    return hint;
  };

  switch (op) {
    case 'is_empty':
      return !actual;
    case 'is_not_empty':
      return !!actual;
    case 'equals': {
      if (isStageField && pipeline) {
        const want = resolveExpectedStage(expected);
        const cur = normName(actual);
        const target = normName(want);
        return (
          cur === target ||
          cur.includes(target) ||
          target.includes(cur)
        );
      }
      return normName(actual) === normName(expected);
    }
    case 'not_equals': {
      if (isStageField && pipeline) {
        const want = resolveExpectedStage(expected);
        const cur = normName(actual);
        const target = normName(want);
        return !(
          cur === target ||
          cur.includes(target) ||
          target.includes(cur)
        );
      }
      return normName(actual) !== normName(expected);
    }
    case 'contains':
      if (isStageField && pipeline) {
        const want = resolveExpectedStage(expected);
        return normName(actual).includes(normName(want));
      }
      return normName(actual).includes(normName(expected));
    case 'not_contains':
      if (isStageField && pipeline) {
        const want = resolveExpectedStage(expected);
        return !normName(actual).includes(normName(want));
      }
      return !normName(actual).includes(normName(expected));
    case 'greater_than': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
    }
    case 'less_than': {
      const a = Number(actual);
      const b = Number(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
    }
    case 'in_list': {
      const parts = expected
        .split(/[,;\n]+/)
        .map((s) => {
          const trimmed = s.trim();
          if (!trimmed) return '';
          return isStageField && pipeline
            ? resolveExpectedStage(trimmed)
            : trimmed;
        })
        .filter(Boolean);
      const cur = normName(actual);
      return parts.some((p) => {
        const n = normName(p);
        return n === cur || cur.includes(n) || n.includes(cur);
      });
    }
    default:
      return false;
  }
}

@Injectable()
export class LeadEngagementAutomationService implements OnModuleInit {
  private readonly logger = new Logger(LeadEngagementAutomationService.name);

  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Pipeline.name, 'crmConnection')
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(LeadEngagementAutomationTemplate.name, 'crmConnection')
    private readonly templateModel: Model<LeadEngagementAutomationTemplateDocument>,
    @InjectModel(WorkflowDelayedJob.name, 'crmConnection')
    private readonly delayedJobModel: Model<WorkflowDelayedJobDocument>,
    @Inject(forwardRef(() => WorkflowsService))
    private readonly workflowsService: WorkflowsService,
    private readonly pipelinesService: PipelinesService,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    private readonly teamsBotService: TeamsBotService,
    @Inject(forwardRef(() => CrmAiService))
    private readonly crmAiService: CrmAiService,
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccountsService: InboxAccountsService,
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly emailTemplateMergeService: EmailTemplateMergeService,
    private readonly emailEngagementBatch: CrmEmailEngagementBatchService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedSystemTemplates();
    } catch (err) {
      this.logger.warn(
        `Skipped lead engagement template seed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async seedSystemTemplates(): Promise<void> {
    for (const preset of LEAD_ENGAGEMENT_SYSTEM_PRESETS) {
      const existing = await this.templateModel
        .findOne({ presetKey: preset.key, isSystem: true })
        .exec();
      const payload = {
        name: preset.name,
        description: preset.description,
        enabled: true,
        presetKey: preset.key,
        rules: preset.rules,
        autoFollowUp: preset.autoFollowUp,
        suggestedPipelineNames: preset.suggestedPipelineNames || [],
        isSystem: true,
      };
      if (existing) {
        await this.templateModel
          .updateOne({ _id: existing._id }, { $set: payload })
          .exec();
      } else {
        await this.templateModel.create(payload);
      }
    }
    await this.applySuggestedPipelineAssignments();
  }

  /** Auto-assign templates to lead pipelines that match suggested names (if unset). */
  private async applySuggestedPipelineAssignments(): Promise<void> {
    const templates = await this.templateModel
      .find({ isSystem: true })
      .lean()
      .exec();
    const pipelines = await this.pipelineModel.find({ type: 'leads' }).exec();
    for (const pipeline of pipelines) {
      if (pipeline.leadEngagementAutomationTemplateId) continue;
      const pname = normName(pipeline.name);
      const hit = templates.find((t) =>
        (t.suggestedPipelineNames || []).some((sn) => {
          const n = normName(sn);
          return n === pname || pname.includes(n) || n.includes(pname);
        }),
      );
      if (hit?._id) {
        await this.pipelineModel
          .updateOne(
            { _id: pipeline._id },
            { leadEngagementAutomationTemplateId: hit._id },
          )
          .exec();
      }
    }
  }

  listSystemPresets() {
    return LEAD_ENGAGEMENT_SYSTEM_PRESETS.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
    }));
  }

  buildFollowUpStepsFromAutoConfig(
    config: LeadEngagementAutoFollowUp,
  ): FollowUpSequenceStepDto[] {
    const days = (config.cadenceDays?.length
      ? config.cadenceDays
      : DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS
    )
      .map((d) => Math.max(0, Number(d) || 0))
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    const sendMode = config.sendMode === 'ai_draft' ? 'ai_draft' : 'template';
    const steps: FollowUpSequenceStepDto[] = [];
    let prev = 0;
    for (const day of days) {
      const gap = day - prev;
      if (gap <= 0) continue;
      if (sendMode === 'ai_draft') {
        steps.push({
          delayDays: gap,
          delayHours: 0,
          delayMinutes: 0,
          email: {
            sendMode: 'ai_draft',
            aiInstructions: config.aiInstructions?.trim() || undefined,
          },
        });
        prev = day;
        continue;
      }
      const templateId =
        config.templateIdByDay?.[String(day)] ||
        config.defaultEmailTemplateId ||
        '';
      if (!templateId || !Types.ObjectId.isValid(templateId)) {
        this.logger.debug(
          `[AutoFollowUp] Skipping day ${day}: template ID missing or invalid (day-specific: ${config.templateIdByDay?.[String(day)] || 'none'}, default: ${config.defaultEmailTemplateId || 'none'})`,
        );
        continue;
      }
      steps.push({
        delayDays: gap,
        delayHours: 0,
        delayMinutes: 0,
        email: { sendMode: 'template', templateId },
      });
      prev = day;
    }
    return steps;
  }

  async listTemplates(): Promise<LeadEngagementAutomationTemplate[]> {
    return this.templateModel.find().sort({ isSystem: -1, name: 1 }).lean().exec();
  }

  async findTemplate(id: string): Promise<LeadEngagementAutomationTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.templateModel.findById(id).lean().exec();
  }

  async createTemplate(body: {
    name: string;
    description?: string;
    enabled?: boolean;
    rules: LeadEngagementAutomationRules;
    autoFollowUp?: LeadEngagementAutoFollowUp;
    autoOutreach?: LeadEngagementAutoOutreach;
    presetKey?: string;
  }): Promise<LeadEngagementAutomationTemplate> {
    return this.templateModel.create({
      name: String(body.name || '').trim(),
      description: body.description?.trim() || undefined,
      enabled: body.enabled !== false,
      rules: body.rules,
      autoFollowUp: body.autoFollowUp,
      autoOutreach: body.autoOutreach,
      presetKey: body.presetKey,
      isSystem: false,
    });
  }

  async createFromPresetKey(
    presetKey: string,
  ): Promise<LeadEngagementAutomationTemplate> {
    const preset = LEAD_ENGAGEMENT_SYSTEM_PRESETS.find((p) => p.key === presetKey);
    if (!preset) {
      throw new BadRequestException('Unknown preset key');
    }
    return this.createTemplate({
      name: `${preset.name} (copy)`,
      description: preset.description,
      rules: JSON.parse(JSON.stringify(preset.rules)),
      autoFollowUp: JSON.parse(JSON.stringify(preset.autoFollowUp)),
      presetKey,
    });
  }

  async updateTemplate(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      enabled: boolean;
      rules: LeadEngagementAutomationRules;
      autoFollowUp: LeadEngagementAutoFollowUp;
      autoOutreach: LeadEngagementAutoOutreach;
    }>,
  ): Promise<LeadEngagementAutomationTemplate | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.templateModel.findById(id).exec();
    if (!doc) return null;
    if (doc.isSystem && body.name && body.name !== doc.name) {
      throw new BadRequestException('Cannot rename system template');
    }
    if (body.name !== undefined) doc.name = String(body.name).trim();
    if (body.description !== undefined) {
      doc.description = body.description?.trim() || undefined;
    }
    if (body.enabled !== undefined) doc.enabled = body.enabled;
    if (body.rules !== undefined) doc.rules = body.rules;
    if (body.autoFollowUp !== undefined) doc.autoFollowUp = body.autoFollowUp;
    if (body.autoOutreach !== undefined) doc.autoOutreach = body.autoOutreach;
    await doc.save();
    return doc.toObject();
  }

  async deleteTemplate(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const doc = await this.templateModel.findById(id).exec();
    if (!doc || doc.isSystem) return false;
    await this.templateModel.findByIdAndUpdate(id, softDeleteUpdate(), { new: true }).exec();
    await this.pipelineModel.updateMany(
      { leadEngagementAutomationTemplateId: new Types.ObjectId(id) },
      { $unset: { leadEngagementAutomationTemplateId: 1 } },
    );
    return true;
  }

  /** Lead pipelines for workflow assignment UI (includes legacy rows missing type). */
  private async findLeadPipelinesForAssignments(): Promise<PipelineDocument[]> {
    const typed = await this.pipelinesService.findAll('leads');
    if (typed.length > 0) {
      return typed as PipelineDocument[];
    }

    const leadPipelineIds = await this.leadModel.distinct('pipeline', {
      pipeline: { $exists: true, $ne: null },
    });
    const objectIds = leadPipelineIds
      .map((id) => String(id))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (objectIds.length === 0) return [];

    const referenced = await this.pipelineModel
      .find({
        _id: { $in: objectIds },
      })
      .sort({ createdAt: 1 })
      .exec();

    const needsType = referenced.filter((p) => p.type !== 'leads');
    if (needsType.length > 0) {
      await this.pipelineModel.updateMany(
        { _id: { $in: needsType.map((p) => p._id) } },
        { $set: { type: 'leads' } },
      );
      for (const p of needsType) {
        p.type = 'leads';
      }
    }
    return referenced;
  }

  async listPipelineAssignments(): Promise<
    Array<{
      pipelineId: string;
      pipelineName: string;
      templateId: string | null;
      templateName: string | null;
    }>
  > {
    const pipelines = await this.findLeadPipelinesForAssignments();
    const templateIds = pipelines
      .map((p) => p.leadEngagementAutomationTemplateId)
      .filter(
        (id): id is Types.ObjectId =>
          !!id && Types.ObjectId.isValid(String(id)),
      );
    const templates = templateIds.length
      ? await this.templateModel
          .find({ _id: { $in: templateIds } })
          .select('name')
          .lean()
          .exec()
      : [];
    const nameById = new Map(
      templates.map((t) => [String(t._id), String(t.name)]),
    );
    return pipelines.map((p) => {
      const tid = p.leadEngagementAutomationTemplateId
        ? String(p.leadEngagementAutomationTemplateId)
        : null;
      return {
        pipelineId: String(p._id),
        pipelineName: String(p.name),
        templateId: tid,
        templateName: tid ? nameById.get(tid) || null : null,
      };
    });
  }

  async assignTemplateToPipeline(
    pipelineId: string,
    templateId: string | null,
  ): Promise<Pipeline | null> {
    if (!Types.ObjectId.isValid(pipelineId)) return null;
    if (templateId != null && templateId !== '') {
      if (!Types.ObjectId.isValid(templateId)) return null;
      const tpl = await this.templateModel.findById(templateId).lean().exec();
      if (!tpl) throw new NotFoundException('Template not found');
    }
    return this.pipelineModel
      .findByIdAndUpdate(
        pipelineId,
        templateId
          ? {
              leadEngagementAutomationTemplateId: new Types.ObjectId(
                templateId,
              ),
            }
          : { $unset: { leadEngagementAutomationTemplateId: 1 } },
        { new: true },
      )
      .exec();
  }

  private async resolveTemplateDocForLead(
    leadId: string,
  ): Promise<{
    doc: LeadEngagementAutomationTemplate;
    pipeline: Pipeline;
    lead: Lead;
  } | null> {
    if (!Types.ObjectId.isValid(leadId)) return null;
    const lead = await this.leadModel.findById(leadId).lean().exec();
    if (!lead || (lead as { converted?: boolean }).converted) return null;

    let pipeline: Pipeline | null = null;
    const pipelineId = (lead as { pipeline?: Types.ObjectId }).pipeline;
    if (pipelineId && Types.ObjectId.isValid(String(pipelineId))) {
      pipeline = await this.pipelineModel.findById(pipelineId).lean().exec();
    }
    if (!pipeline) {
      pipeline = await this.pipelineModel
        .findOne({ type: 'leads', isDefault: true })
        .lean()
        .exec();
    }
    if (!pipeline) {
      pipeline = await this.pipelineModel
        .findOne({ type: 'leads' })
        .sort({ createdAt: 1 })
        .lean()
        .exec();
    }
    if (!pipeline) return null;

    const templateRef = pipeline.leadEngagementAutomationTemplateId;
    if (!templateRef || !Types.ObjectId.isValid(String(templateRef))) {
      return null;
    }

    const tplDoc = await this.templateModel.findById(templateRef).lean().exec();
    if (!tplDoc || tplDoc.enabled === false) return null;

    return {
      doc: tplDoc as LeadEngagementAutomationTemplate,
      pipeline: pipeline as Pipeline,
      lead: lead as Lead,
    };
  }

  /**
   * When a new lead is created on a pipeline with an engagement template:
   * - optional auto outreach (AI or template) as first email
   * - optional scheduled follow-up cadence
   */
  async onLeadCreated(
    leadId: string,
    user?: {
      userId?: string;
      _id?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    },
  ): Promise<void> {
    try {
      const ctx = await this.resolveTemplateDocForLead(leadId);
      if (!ctx?.doc) return;

      const leadEmail = String((ctx.lead as { email?: string }).email || '').trim();
      if (!leadEmail || !leadEmail.includes('@')) {
        this.logger.debug(
          `Lead automation skipped for ${leadId}: no valid email`,
        );
        return;
      }

      const pipelineOutreach = (ctx.pipeline as { outreachAiContext?: PipelineOutreachAiContext })
        .outreachAiContext;

      if (ctx.doc.autoOutreach?.enabled) {
        const delayMin = Math.max(
          0,
          Number(ctx.doc.autoOutreach.delayMinutes) || 0,
        );
        if (delayMin > 0) {
          setTimeout(() => {
            void this.sendAutoOutreachEmail(leadId, ctx, user, pipelineOutreach);
          }, delayMin * 60_000);
        } else {
          await this.sendAutoOutreachEmail(
            leadId,
            ctx,
            user,
            pipelineOutreach,
          );
        }
      }

      if (!ctx.doc.autoFollowUp?.enabled) return;

      const followUpConfig = ctx.doc.autoFollowUp;
      const steps = this.buildFollowUpStepsFromAutoConfig(followUpConfig);

      if (!steps.length) {
        const sendMode = followUpConfig.sendMode || 'template';
        const issue =
          sendMode === 'ai_draft'
            ? `AI draft mode enabled but missing aiInstructions`
            : `Template mode enabled but missing templates. Configure either: (1) defaultEmailTemplateId, or (2) templateIdByDay, or (3) switch to sendMode: 'ai_draft'`;

        this.logger.warn(
          `[AutoFollowUp] Cannot start follow-up sequence for lead ${leadId}\n` +
          `  Template: ${ctx.doc.name}\n` +
          `  Send Mode: ${sendMode}\n` +
          `  Cadence Days: ${followUpConfig.cadenceDays?.join(', ') || DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS.join(', ')}\n` +
          `  Default Template ID: ${followUpConfig.defaultEmailTemplateId || 'NOT SET'}\n` +
          `  Day-specific Templates: ${Object.keys(followUpConfig.templateIdByDay || {}).length > 0 ? 'yes' : 'NONE SET'}\n` +
          `  Issue: ${issue}`,
        );
        return;
      }

      await this.workflowsService.startFollowUpSequence(
        {
          entityType: 'Lead',
          entityId: leadId,
          cancelOnReply: ctx.doc.autoFollowUp.cancelOnReply !== false,
          steps,
        },
        {
          userId: user?.userId || user?._id,
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
        },
      );
      this.logger.log(
        `[AutoFollowUp] Follow-up sequence started for lead ${leadId}\n` +
        `  Template: ${ctx.doc.name}\n` +
        `  Steps: ${steps.length}\n` +
        `  Cadence: ${steps.map(s => s.delayDays).join(' → ')} days\n` +
        `  Cancel on reply: ${ctx.doc.autoFollowUp.cancelOnReply !== false}`,
      );
    } catch (err) {
      this.logger.warn(
        `onLeadCreated automation (${leadId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async sendAutoOutreachEmail(
    leadId: string,
    ctx: {
      doc: LeadEngagementAutomationTemplate;
      pipeline: Pipeline;
      lead: Lead;
    },
    user?: {
      userId?: string;
      _id?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    },
    pipelineOutreach?: PipelineOutreachAiContext,
  ): Promise<void> {
    const config = ctx.doc.autoOutreach;
    if (!config?.enabled) return;

    const to = String((ctx.lead as { email?: string }).email || '').trim();
    if (!to || !to.includes('@')) return;

    const requiredFields = (
      config.requiredContextFields?.length
        ? config.requiredContextFields
        : pipelineOutreach?.requiredContextFields || []
    ) as OutreachContextFieldKey[];
    const missingAction =
      config.missingContextAction ||
      pipelineOutreach?.missingContextAction ||
      'draft_anyway';

    let contextCheck;
    try {
      contextCheck = await this.crmAiService.checkPersonOutreachContext(
        undefined,
        'leads',
        leadId,
        { requiredContextFields: requiredFields, missingContextAction: missingAction },
      );
    } catch (err) {
      this.logger.warn(
        `Auto outreach context check failed for lead ${leadId}: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    if (!contextCheck.canAutoSend) {
      if (missingAction === 'create_task') {
        const title =
          config.missingContextTaskTitle?.trim() ||
          pipelineOutreach?.missingContextTaskTitle?.trim() ||
          `Complete lead context for outreach — ${contextCheck.missingLabels.join(', ')}`;
        await this.createTaskForLead(new Types.ObjectId(leadId), {
          title,
          body: `Missing CRM fields: ${contextCheck.missingLabels.join(', ')}. Add context then send outreach manually.`,
          dueInDays: 0,
        });
      }
      this.logger.log(
        `Auto outreach skipped for lead ${leadId}: missing context (${contextCheck.missingLabels.join(', ')})`,
      );
      return;
    }

    const sendMode = config.sendMode === 'template' ? 'template' : 'ai_draft';
    let subject = '';
    let body = '';

    if (sendMode === 'ai_draft') {
      try {
        const draft = await this.crmAiService.draftAutomatedPersonOutreachEmail(
          'leads',
          leadId,
          config.aiInstructions?.trim() || undefined,
          {
            requiredContextFields: requiredFields,
            missingContextAction: missingAction,
            skipContextCheck: true,
          },
        );
        subject = draft.subject;
        body = draft.bodyHtml;
      } catch (err) {
        this.logger.warn(
          `Auto outreach AI draft failed for lead ${leadId}: ${err instanceof Error ? err.message : err}`,
        );
        return;
      }
    } else {
      const templateId = String(config.templateId || '').trim();
      if (!templateId || !Types.ObjectId.isValid(templateId)) {
        this.logger.warn(
          `Auto outreach template mode enabled but no valid templateId for lead ${leadId}`,
        );
        return;
      }
      // Template merge handled by inbox send with templateId — use workflow-style path
      const tpl = await this.emailTemplatesService.findOne(templateId);
      if (!tpl) {
        this.logger.warn(
          `Auto outreach template ${templateId} not found for lead ${leadId}`,
        );
        return;
      }
      const merge = await this.emailTemplateMergeService.mergeForWorkflow(
        'Lead',
        new Types.ObjectId(leadId),
        ctx.lead as unknown as Record<string, unknown>,
        user
          ? {
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
            }
          : undefined,
      );
      subject = this.emailTemplatesService.fillVariables(tpl.subject, merge);
      body = this.emailTemplatesService.fillVariables(tpl.body, merge);
    }

    const userId = String(user?.userId || user?._id || '').trim();
    const accountId = await this.resolveAutoOutreachAccountId(
      config.inboxAccountId,
      userId,
      String((ctx.lead as { leadOwner?: string }).leadOwner || ''),
    );
    if (!accountId) {
      this.logger.warn(
        `Auto outreach skipped for lead ${leadId}: no connected mailbox`,
      );
      return;
    }

    const res = await this.inboxAccountsService.sendFromAccount(
      userId || accountId,
      accountId,
      {
        to,
        subject,
        body,
        module: 'leads',
        entityId: leadId,
        enforceCrmRecipient: true,
        templateId:
          sendMode === 'template' ? String(config.templateId || '') : undefined,
        systemBypassAuth: true,
        workflowMeta: { followUpSequence: false },
      },
    );
    if (res?.success) {
      this.logger.log(`Auto outreach email sent for lead ${leadId}`);
    } else if (res?.error) {
      this.logger.warn(`Auto outreach send failed for lead ${leadId}: ${res.error}`);
    }
  }

  private async resolveAutoOutreachAccountId(
    configuredId: string | undefined,
    userId: string,
    leadOwnerLabel: string,
  ): Promise<string | null> {
    if (configuredId && Types.ObjectId.isValid(configuredId)) {
      return configuredId;
    }
    if (userId) {
      const preferred =
        await this.inboxAccountsService.getPreferredSendAccountId(userId);
      if (preferred) return preferred;
    }
    if (leadOwnerLabel.trim()) {
      const accounts = await this.inboxAccountsService.findAccountsByUser(
        leadOwnerLabel,
        leadOwnerLabel,
      );
      const first = (Array.isArray(accounts) ? accounts : []).find(
        (a: { isActive?: boolean }) => a?.isActive !== false,
      ) as { _id?: { toString(): string } } | undefined;
      if (first?._id) return String(first._id);
    }
    return null;
  }

  private leadAtTarget(
    lead: { stage?: string; pipeline?: Types.ObjectId },
    resolved: {
      pipelineId?: Types.ObjectId;
      stage: string;
    },
    currentPipeline: Pipeline,
  ): boolean {
    const curStage = normName(String(lead.stage || ''));
    const newStage = normName(resolved.stage);
    const stageSame =
      curStage === newStage ||
      curStage.includes(newStage) ||
      newStage.includes(curStage);
    const curPipe = String(
      lead.pipeline || (currentPipeline as { _id?: unknown })._id || '',
    );
    const newPipe = String(
      resolved.pipelineId ||
        (currentPipeline as { _id?: unknown })._id ||
        '',
    );
    return stageSame && curPipe === newPipe;
  }

  private async resolveTargetStage(
    target: LeadEngagementStageTarget | undefined,
    currentPipeline: Pipeline,
  ): Promise<{
    pipelineId?: Types.ObjectId;
    pipelineName?: string;
    stage: string | null;
  } | null> {
    if (!target) return null;

    const currentPipelineId = (currentPipeline as { _id?: Types.ObjectId })._id;
    let pipelineId: Types.ObjectId | undefined = currentPipelineId
      ? new Types.ObjectId(String(currentPipelineId))
      : undefined;
    let pipelineName = String(currentPipeline.name || '');
    let stageToSet: string | null = null;

    if (target.pipelineName?.trim()) {
      const dest = await this.pipelineModel
        .findOne({
          type: 'leads',
          name: new RegExp(
            `^${target.pipelineName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i',
          ),
        })
        .lean()
        .exec();
      if (!dest) {
        const fuzzy = await this.pipelineModel
          .find({ type: 'leads' })
          .lean()
          .exec();
        const want = normName(target.pipelineName);
        const hit = fuzzy.find(
          (p) =>
            normName(p.name).includes(want) || want.includes(normName(p.name)),
        );
        if (!hit) return null;
        pipelineId = hit._id as Types.ObjectId;
        pipelineName = String(hit.name || '');
        const stageHint =
          target.stageNameInTargetPipeline || target.stageName || '';
        stageToSet = stageHint
          ? stageMatches(hit as Pipeline, stageHint)
          : null;
        if (!stageToSet) {
          const def =
            (hit.stages || []).find((s) => s.isDefault) || hit.stages?.[0];
          stageToSet = def?.name || null;
        }
      } else {
        pipelineId = dest._id as Types.ObjectId;
        pipelineName = String(dest.name || '');
        const stageHint =
          target.stageNameInTargetPipeline || target.stageName || '';
        stageToSet = stageHint
          ? stageMatches(dest as Pipeline, stageHint)
          : null;
        if (!stageToSet) {
          const def =
            (dest.stages || []).find((s) => s.isDefault) || dest.stages?.[0];
          stageToSet = def?.name || null;
        }
      }
    } else if (target.stageName?.trim()) {
      stageToSet = stageMatches(currentPipeline, target.stageName);
      if (!stageToSet) return null;
    }

    if (!stageToSet) return null;
    return { pipelineId, pipelineName, stage: stageToSet };
  }

  private async applyTarget(
    leadId: string,
    target: LeadEngagementStageTarget | undefined,
    currentPipeline: Pipeline,
  ): Promise<boolean> {
    const resolved = await this.resolveTargetStage(target, currentPipeline);
    if (!resolved?.stage) {
      if (target?.stageName || target?.pipelineName) {
        this.logger.warn(
          `Lead automation: could not resolve target for lead ${leadId}`,
        );
      }
      return false;
    }

    const lead = await this.leadModel
      .findById(leadId)
      .select('stage pipeline')
      .lean()
      .exec();
    if (
      lead &&
      this.leadAtTarget(lead as Lead, resolved as { pipelineId?: Types.ObjectId; stage: string }, currentPipeline)
    ) {
      return false;
    }

    const patch: Record<string, unknown> = {
      stage: resolved.stage,
      status: resolved.stage,
    };
    if (
      resolved.pipelineId &&
      String(resolved.pipelineId) !==
        String((currentPipeline as { _id?: unknown })._id)
    ) {
      patch.pipeline = resolved.pipelineId;
    }

    await this.leadModel.findByIdAndUpdate(leadId, patch).exec();
    return true;
  }

  private async previewTarget(
    lead: Lead,
    target: LeadEngagementStageTarget | undefined,
    currentPipeline: Pipeline,
  ): Promise<{
    wouldMove: boolean;
    newStage?: string;
    targetPipelineName?: string;
  }> {
    const resolved = await this.resolveTargetStage(target, currentPipeline);
    if (!resolved?.stage) return { wouldMove: false };
    const wouldMove = !this.leadAtTarget(
      lead,
      resolved as { pipelineId?: Types.ObjectId; stage: string },
      currentPipeline,
    );
    return {
      wouldMove,
      newStage: resolved.stage,
      targetPipelineName:
        resolved.pipelineName !== String(currentPipeline.name || '')
          ? resolved.pipelineName
          : undefined,
    };
  }

  private passesStageGuard(
    lead: { stage?: string },
    extras?: LeadEngagementRuleExtras,
  ): boolean {
    if (!extras?.onlyIfStages?.length) return true;
    const cur = normName(String(lead.stage || ''));
    return extras.onlyIfStages.some((s) => {
      const want = normName(s);
      return want === cur || cur.includes(want) || want.includes(cur);
    });
  }

  private passesPipelineGuard(
    pipeline: Pipeline,
    onlyIfPipelineNames?: string[],
  ): boolean {
    if (!onlyIfPipelineNames?.length) return true;
    const cur = normName(String(pipeline.name || ''));
    return onlyIfPipelineNames.some((n) => {
      const want = normName(n);
      return want === cur || cur.includes(want) || want.includes(cur);
    });
  }

  /** Resolve stage target labels against the lead's pipeline at runtime. */
  private resolveStageRuleTarget(
    target: LeadEngagementStageTarget,
    leadPipeline: Pipeline,
  ): LeadEngagementStageTarget {
    if (target.pipelineName?.trim()) {
      return target;
    }
    const hint = target.stageName || target.stageNameInTargetPipeline || '';
    if (!hint.trim()) return target;
    const resolved = stageMatches(leadPipeline, hint);
    return resolved ? { ...target, stageName: resolved } : target;
  }

  private async createTaskForLead(
    leadId: Types.ObjectId,
    task: LeadEngagementTaskAction,
    authorId?: Types.ObjectId,
  ): Promise<void> {
    const due = new Date(
      Date.now() + Math.max(0, task.dueInDays ?? 0) * 86400000,
    );
    const calendarEnabled = task.calendarEnabled !== false;
    const reminderEnabled = task.reminderEnabled !== false;
    const reminderBeforeMinutes = Math.max(
      0,
      Number(task.reminderBeforeMinutes ?? 0),
    );
    const reminderAt = new Date(
      due.getTime() - reminderBeforeMinutes * 60_000,
    );
    const lead = await this.leadModel
      .findById(leadId)
      .select('leadOwner')
      .lean()
      .exec();
    const title = String(task.title || '').trim() || 'Automation task';
    const body = task.body?.trim() || '';
    const content = body ? `${title}\n\n${body}` : title;
    await new this.activityModel({
      type: 'Task',
      title,
      content,
      relatedTo: leadId,
      relatedType: 'Lead',
      ...(authorId ? { author: authorId } : {}),
      metadata: {
        status: 'Pending',
        dueAt: due.toISOString(),
        dueDate: due.toISOString(),
        isCalendarEvent: calendarEnabled,
        reminderDisabled: !reminderEnabled,
        ...(reminderEnabled
          ? {
              reminderAt: reminderAt.toISOString(),
              reminderType: 'follow_up',
              reminderMessage: `Automated follow-up task: ${title}`,
            }
          : {}),
        reminderRecipientLabel: String(
          (lead as { leadOwner?: string } | null)?.leadOwner || '',
        ).trim(),
        remindersSent: [],
        leadEngagementAutomation: true,
      },
    }).save();
  }

  private async notifyTeamsForLead(
    leadId: string,
    notify: LeadEngagementRuleExtras['notifyTeams'],
  ): Promise<void> {
    if (!notify?.message?.trim()) return;
    const toEmail = String(notify.email || '').trim();
    if (!toEmail || !toEmail.includes('@')) return;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link =
      notify.link || `${frontendUrl}/crm/leads/${leadId}`;
    await this.teamsBotService.sendProactiveDM(
      toEmail,
      'CRM lead automation',
      notify.message.trim(),
      link,
    );
  }

  private async runRuleSideEffects(
    leadId: string,
    rule: LeadEngagementRuleExtras | undefined,
    authorId?: Types.ObjectId,
  ): Promise<void> {
    if (!rule) return;
    if (rule.createTask) {
      await this.createTaskForLead(
        new Types.ObjectId(leadId),
        rule.createTask,
        authorId,
      );
    }
    if (rule.notifyTeams) {
      await this.notifyTeamsForLead(leadId, rule.notifyTeams);
    }
  }

  private async syncContactFromLead(lead: Lead): Promise<void> {
    const email = String((lead as { email?: string }).email || '').trim();
    if (!email && !(lead as { firstName?: string }).firstName?.trim()) return;

    const leadIdRaw = (lead as { _id?: Types.ObjectId | string })._id;
    if (!leadIdRaw) return;
    const leadOid = new Types.ObjectId(String(leadIdRaw));
    let existing = email
      ? await this.contactModel
          .findOne({
            email: new RegExp(
              `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
              'i',
            ),
          })
          .exec()
      : null;
    if (!existing) {
      existing = await this.contactModel.findOne({ sourceLead: leadOid }).exec();
    }

    const patch: Record<string, unknown> = {
      firstName: (lead as { firstName?: string }).firstName || 'Unknown',
      lastName: (lead as { lastName?: string }).lastName || '',
      ...(email ? { email } : {}),
      phone: (lead as { phone?: string }).phone,
      mobileNo: (lead as { mobileNo?: string }).mobileNo,
      organization: (lead as { organization?: string }).organization,
      jobTitle: (lead as { jobTitle?: string }).jobTitle,
      stage: (lead as { stage?: string }).stage,
      pipeline: (lead as { pipeline?: Types.ObjectId }).pipeline,
    };

    if (existing) {
      await this.contactModel
        .findByIdAndUpdate(existing._id, patch, { returnDocument: 'after' })
        .exec();
      await this.contactModel
        .findByIdAndUpdate(existing._id, {
          $addToSet: { associatedLeads: leadOid },
        })
        .exec();
    } else {
      await this.contactModel.create({
        ...patch,
        sourceLead: leadOid,
      });
    }
  }

  async onLeadEmailOpened(leadId: string): Promise<void> {
    try {
      const ctx = await this.resolveTemplateDocForLead(leadId);
      const rule = ctx?.doc.rules.onEmailOpened;
      if (!ctx || !rule || !ruleEnabled(rule)) return;
      if (!this.passesStageGuard(ctx.lead as { stage?: string }, rule)) return;

      await this.applyTarget(leadId, rule, ctx.pipeline);

      if (rule.syncContact) {
        const fresh = await this.leadModel.findById(leadId).lean().exec();
        if (fresh) await this.syncContactFromLead(fresh as Lead);
      }
      await this.runRuleSideEffects(leadId, rule);
    } catch (err) {
      this.logger.warn(
        `onLeadEmailOpened(${leadId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onLeadEmailReply(leadId: string): Promise<void> {
    try {
      const ctx = await this.resolveTemplateDocForLead(leadId);
      const rule = ctx?.doc.rules.onReply;
      if (!ctx || !rule || !ruleEnabled(rule)) return;
      if (!this.passesStageGuard(ctx.lead as { stage?: string }, rule)) return;
      await this.applyTarget(leadId, rule, ctx.pipeline);
      await this.runRuleSideEffects(leadId, rule);
    } catch (err) {
      this.logger.warn(
        `onLeadEmailReply(${leadId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onLeadFollowUpEmailSent(
    leadId: string,
    followUpStepNumber: number,
  ): Promise<void> {
    try {
      const ctx = await this.resolveTemplateDocForLead(leadId);
      const followRule = ctx?.doc.rules.onFollowUpSent;
      const pattern = followRule?.stageNamePattern;
      if (!ctx || !pattern || !ruleEnabled(followRule)) return;

      const stageName =
        stageForFollowUpPattern(
          ctx.pipeline,
          pattern,
          followUpStepNumber,
        ) || pattern.replace(/\{n\}/gi, String(followUpStepNumber));
      await this.applyTarget(
        leadId,
        { stageName },
        ctx.pipeline,
      );
    } catch (err) {
      this.logger.warn(
        `onLeadFollowUpEmailSent(${leadId}, ${followUpStepNumber}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onLeadFollowUpSequenceComplete(leadId: string): Promise<void> {
    try {
      const ctx = await this.resolveTemplateDocForLead(leadId);
      const seqRule = ctx?.doc.rules.onFollowUpSequenceComplete;
      if (!ctx || !seqRule || !ruleEnabled(seqRule)) return;

      const pending = await this.delayedJobModel.countDocuments({
        entityType: 'Lead',
        entityId: new Types.ObjectId(leadId),
        status: 'pending',
        branchLabel: 'Follow-up sequence',
      });
      if (pending > 0) return;

      await this.applyTarget(leadId, seqRule, ctx.pipeline);
      await this.runRuleSideEffects(leadId, seqRule);
    } catch (err) {
      this.logger.warn(
        `onLeadFollowUpSequenceComplete(${leadId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Evaluate property-based stage rules after a lead is created or updated. */
  async onLeadUpdated(leadId: string): Promise<void> {
    try {
      await this.applyStageRulesForLead(leadId);
    } catch (err) {
      this.logger.warn(
        `onLeadUpdated stage rules (${leadId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Apply the first matching property-based stage rule for a lead.
   * Used automatically on create/update and for manual bulk runs.
   */
  async applyStageRulesForLead(
    leadId: string,
    options?: { dryRun?: boolean },
  ): Promise<LeadAutomationRunItemResult> {
    const base: LeadAutomationRunItemResult = {
      leadId,
      moved: false,
      reason: 'none',
    };
    try {
      const ctx = await this.resolveTemplateDocForLead(leadId);
      if (!ctx?.doc.enabled) return base;

      const leadRecord = ctx.lead as Lead;
      base.leadName = leadDisplayName(leadRecord);
      base.currentStage = String(leadRecord.stage || leadRecord.status || '');

      const rules = (ctx.doc.rules.stageRules || []).filter(
        (r) => r.enabled !== false && String(r.field || '').trim(),
      );
      if (!rules.length) return base;

      const lead = leadRecord as unknown as Record<string, unknown>;
      for (const rule of rules) {
        if (
          !this.passesPipelineGuard(ctx.pipeline, rule.onlyIfPipelineNames)
        ) {
          continue;
        }
        if (
          !this.passesStageGuard(lead as { stage?: string }, {
            onlyIfStages: rule.onlyIfStages,
          })
        ) {
          continue;
        }
        if (!evaluateLeadStageCondition(lead, rule, ctx.pipeline)) continue;

        const target = this.resolveStageRuleTarget(rule.target, ctx.pipeline);
        if (options?.dryRun) {
          const preview = await this.previewTarget(
            leadRecord,
            target,
            ctx.pipeline,
          );
          if (preview.wouldMove) {
            return {
              leadId,
              leadName: base.leadName,
              currentStage: base.currentStage,
              moved: true,
              reason: 'stage_rule',
              ruleLabel: rule.label?.trim() || rule.field,
              newStage: preview.newStage,
              targetPipelineName: preview.targetPipelineName,
            };
          }
          continue;
        }

        const moved = await this.applyTarget(leadId, target, ctx.pipeline);
        if (moved) {
          await this.runRuleSideEffects(leadId, rule);
          const fresh = await this.leadModel
            .findById(leadId)
            .select('stage')
            .lean()
            .exec();
          return {
            leadId,
            leadName: base.leadName,
            currentStage: base.currentStage,
            moved: true,
            reason: 'stage_rule',
            ruleLabel: rule.label?.trim() || rule.field,
            newStage: String((fresh as { stage?: string })?.stage || ''),
          };
        }
      }
      return base;
    } catch (err) {
      return {
        ...base,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Re-apply email open / reply stage rules when engagement data exists but the
   * lead was never moved (e.g. rules added after the event, or missed webhook).
   */
  async reconcileEngagementForLead(
    leadId: string,
    options?: { dryRun?: boolean },
  ): Promise<LeadAutomationRunItemResult> {
    const base: LeadAutomationRunItemResult = {
      leadId,
      moved: false,
      reason: 'none',
    };
    try {
      const ctx = await this.resolveTemplateDocForLead(leadId);
      if (!ctx?.doc.enabled) return base;

      const leadRecord = ctx.lead as Lead;
      base.leadName = leadDisplayName(leadRecord);
      base.currentStage = String(leadRecord.stage || leadRecord.status || '');

      const batch = await this.emailEngagementBatch.getBatchForModule(
        [leadId],
        'leads',
      );
      const stats = batch.byId[leadId];
      if (!stats) return base;

      if (
        stats.hasInboundThreadReply &&
        ctx.doc.rules.onReply &&
        ruleEnabled(ctx.doc.rules.onReply)
      ) {
        const rule = ctx.doc.rules.onReply;
        if (this.passesStageGuard(ctx.lead as { stage?: string }, rule)) {
          if (options?.dryRun) {
            const preview = await this.previewTarget(
              leadRecord,
              rule,
              ctx.pipeline,
            );
            if (preview.wouldMove) {
              return {
                leadId,
                leadName: base.leadName,
                currentStage: base.currentStage,
                moved: true,
                reason: 'reply',
                newStage: preview.newStage,
                targetPipelineName: preview.targetPipelineName,
                ruleLabel: 'On reply',
              };
            }
          } else {
            const moved = await this.applyTarget(leadId, rule, ctx.pipeline);
            if (moved) {
              await this.runRuleSideEffects(leadId, rule);
              const fresh = await this.leadModel
                .findById(leadId)
                .select('stage')
                .lean()
                .exec();
              return {
                leadId,
                leadName: base.leadName,
                currentStage: base.currentStage,
                moved: true,
                reason: 'reply',
                newStage: String((fresh as { stage?: string })?.stage || ''),
                ruleLabel: 'On reply',
              };
            }
          }
        }
      }

      if (
        stats.engagement.opened &&
        ctx.doc.rules.onEmailOpened &&
        ruleEnabled(ctx.doc.rules.onEmailOpened)
      ) {
        const rule = ctx.doc.rules.onEmailOpened;
        if (this.passesStageGuard(ctx.lead as { stage?: string }, rule)) {
          if (options?.dryRun) {
            const preview = await this.previewTarget(
              leadRecord,
              rule,
              ctx.pipeline,
            );
            if (preview.wouldMove) {
              return {
                leadId,
                leadName: base.leadName,
                currentStage: base.currentStage,
                moved: true,
                reason: 'email_open',
                newStage: preview.newStage,
                targetPipelineName: preview.targetPipelineName,
                ruleLabel: 'On email open',
              };
            }
          } else {
            const moved = await this.applyTarget(leadId, rule, ctx.pipeline);
            if (moved) {
              if (rule.syncContact) {
                const freshLead = await this.leadModel
                  .findById(leadId)
                  .lean()
                  .exec();
                if (freshLead) await this.syncContactFromLead(freshLead as Lead);
              }
              await this.runRuleSideEffects(leadId, rule);
              const fresh = await this.leadModel
                .findById(leadId)
                .select('stage')
                .lean()
                .exec();
              return {
                leadId,
                leadName: base.leadName,
                currentStage: base.currentStage,
                moved: true,
                reason: 'email_open',
                newStage: String((fresh as { stage?: string })?.stage || ''),
                ruleLabel: 'On email open',
              };
            }
          }
        }
      }

      return base;
    } catch (err) {
      return {
        ...base,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Run engagement reconcile (optional) then property stage rules for one lead. */
  async runAutomationForLead(
    leadId: string,
    options?: { includeEngagementReconcile?: boolean; dryRun?: boolean },
  ): Promise<LeadAutomationRunItemResult> {
    if (options?.includeEngagementReconcile) {
      const engagement = await this.reconcileEngagementForLead(leadId, {
        dryRun: options.dryRun,
      });
      if (engagement.moved) return engagement;
    }
    return this.applyStageRulesForLead(leadId, { dryRun: options?.dryRun });
  }

  async getTemplateForPipeline(pipelineId: string): Promise<{
    pipelineId: string;
    pipelineName: string;
    templateId: string | null;
    templateName: string | null;
    template: LeadEngagementAutomationTemplate | null;
  } | null> {
    if (!Types.ObjectId.isValid(pipelineId)) return null;
    const pipeline = await this.pipelineModel.findById(pipelineId).lean().exec();
    if (!pipeline) return null;
    const templateRef = pipeline.leadEngagementAutomationTemplateId;
    let template: LeadEngagementAutomationTemplate | null = null;
    let templateName: string | null = null;
    if (templateRef && Types.ObjectId.isValid(String(templateRef))) {
      const doc = await this.templateModel.findById(templateRef).lean().exec();
      if (doc) {
        template = doc as LeadEngagementAutomationTemplate;
        templateName = String(doc.name || '');
      }
    }
    return {
      pipelineId: String(pipeline._id),
      pipelineName: String(pipeline.name || ''),
      templateId: template ? String(templateRef) : null,
      templateName,
      template,
    };
  }

  async updateRuleToggles(
    templateId: string,
    toggles: LeadEngagementRuleToggles,
  ): Promise<LeadEngagementAutomationTemplate | null> {
    if (!Types.ObjectId.isValid(templateId)) return null;
    const doc = await this.templateModel.findById(templateId).exec();
    if (!doc) return null;

    const rules = { ...doc.rules };

    if (toggles.onEmailOpened !== undefined && rules.onEmailOpened) {
      rules.onEmailOpened = {
        ...rules.onEmailOpened,
        enabled: toggles.onEmailOpened,
      };
    }
    if (toggles.onReply !== undefined && rules.onReply) {
      rules.onReply = { ...rules.onReply, enabled: toggles.onReply };
    }
    if (toggles.onFollowUpSent !== undefined && rules.onFollowUpSent) {
      rules.onFollowUpSent = {
        ...rules.onFollowUpSent,
        enabled: toggles.onFollowUpSent,
      };
    }
    if (
      toggles.onFollowUpSequenceComplete !== undefined &&
      rules.onFollowUpSequenceComplete
    ) {
      rules.onFollowUpSequenceComplete = {
        ...rules.onFollowUpSequenceComplete,
        enabled: toggles.onFollowUpSequenceComplete,
      };
    }
    if (toggles.stageRules && Array.isArray(rules.stageRules)) {
      rules.stageRules = rules.stageRules.map((rule) => {
        const next = toggles.stageRules?.[rule.id];
        if (next === undefined) return rule;
        return { ...rule, enabled: next };
      });
    }

    doc.rules = rules;
    await doc.save();
    return doc.toObject();
  }

  /** Manual or scheduled bulk run for selected leads or an entire pipeline. */
  async runAutomationBulk(body: {
    leadIds?: string[];
    pipelineId?: string;
    includeEngagementReconcile?: boolean;
    dryRun?: boolean;
  }): Promise<LeadAutomationBulkRunResult> {
    const includeEngagement = body.includeEngagementReconcile !== false;
    const dryRun = body.dryRun === true;
    let leadIds: string[] = [];

    if (Array.isArray(body.leadIds) && body.leadIds.length > 0) {
      const seen = new Set<string>();
      for (const raw of body.leadIds) {
        const id = String(raw || '').trim();
        if (!Types.ObjectId.isValid(id) || seen.has(id)) continue;
        seen.add(id);
        leadIds.push(id);
        if (leadIds.length >= MAX_AUTOMATION_BATCH) break;
      }
    } else if (body.pipelineId && Types.ObjectId.isValid(body.pipelineId)) {
      const rows = await this.leadModel
        .find({
          pipeline: new Types.ObjectId(body.pipelineId),
          converted: { $ne: true },
        })
        .select('_id')
        .limit(MAX_AUTOMATION_BATCH)
        .lean()
        .exec();
      leadIds = rows.map((r) => String(r._id));
    } else {
      throw new BadRequestException(
        'Provide leadIds or a valid pipelineId',
      );
    }

    if (!leadIds.length) {
      return { processed: 0, moved: 0, dryRun, results: [] };
    }

    const results: LeadAutomationRunItemResult[] = [];
    let moved = 0;
    for (const leadId of leadIds) {
      const result = await this.runAutomationForLead(leadId, {
        includeEngagementReconcile: includeEngagement,
        dryRun,
      });
      results.push(result);
      if (result.moved) moved += 1;
    }

    return { processed: leadIds.length, moved, dryRun, results };
  }

  /** Count follow-up emails already sent in this sequence run (for step index). */
  countFollowUpEmailsSent(results: string[]): number {
    return results.filter((r) => /^Email sent/i.test(r)).length;
  }

  /**
   * Diagnose why follow-up emails might not be triggering.
   * Checks template configuration and provides actionable feedback.
   */
  async diagnoseFollowUpConfiguration(templateId: string): Promise<{
    status: 'ok' | 'warning' | 'error';
    summary: string;
    template: {
      id: string;
      name: string;
      enabled: boolean;
    } | null;
    followUp: {
      enabled: boolean;
      sendMode: string;
      cadenceDays: number[];
      hasDefaultTemplate: boolean;
      daySpecificTemplates: Record<string, boolean>;
      aiInstructions: string | null;
    } | null;
    issues: Array<{
      type: 'error' | 'warning' | 'info';
      message: string;
      fix: string;
    }>;
  }> {
    if (!Types.ObjectId.isValid(templateId)) {
      return {
        status: 'error',
        summary: 'Invalid template ID',
        template: null,
        followUp: null,
        issues: [
          {
            type: 'error',
            message: 'Template ID is not a valid MongoDB ID',
            fix: 'Provide a valid template ID from your lead engagement automation settings',
          },
        ],
      };
    }

    const tpl = await this.templateModel.findById(templateId).lean().exec();

    if (!tpl) {
      return {
        status: 'error',
        summary: 'Template not found',
        template: null,
        followUp: null,
        issues: [
          {
            type: 'error',
            message: `No automation template found with ID: ${templateId}`,
            fix: 'Check that the template exists and the ID is correct',
          },
        ],
      };
    }

    const followUpConfig = tpl.autoFollowUp;
    const issues: Array<{
      type: 'error' | 'warning' | 'info';
      message: string;
      fix: string;
    }> = [];

    if (!followUpConfig) {
      return {
        status: 'warning',
        summary: 'Follow-up configuration not found',
        template: {
          id: String(tpl._id),
          name: String(tpl.name),
          enabled: tpl.enabled !== false,
        },
        followUp: null,
        issues: [
          {
            type: 'warning',
            message: 'This template has no follow-up configuration',
            fix: 'Add follow-up configuration when editing the template',
          },
        ],
      };
    }

    if (!followUpConfig.enabled) {
      return {
        status: 'warning',
        summary: 'Follow-ups are disabled',
        template: {
          id: String(tpl._id),
          name: String(tpl.name),
          enabled: tpl.enabled !== false,
        },
        followUp: {
          enabled: false,
          sendMode: followUpConfig.sendMode || 'template',
          cadenceDays: followUpConfig.cadenceDays || DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS,
          hasDefaultTemplate: !!followUpConfig.defaultEmailTemplateId,
          daySpecificTemplates: Object.entries(followUpConfig.templateIdByDay || {}).reduce(
            (acc, [day, id]) => {
              acc[day] = !!id && Types.ObjectId.isValid(id);
              return acc;
            },
            {} as Record<string, boolean>,
          ),
          aiInstructions: followUpConfig.aiInstructions || null,
        },
        issues: [
          {
            type: 'warning',
            message: 'Auto follow-ups are disabled for this template',
            fix: 'Enable auto follow-ups in the template settings',
          },
        ],
      };
    }

    const sendMode = followUpConfig.sendMode || 'template';
    const cadenceDays = followUpConfig.cadenceDays || DEFAULT_LEAD_ENGAGEMENT_CADENCE_DAYS;
    const hasDefaultTemplate = !!(
      followUpConfig.defaultEmailTemplateId &&
      Types.ObjectId.isValid(followUpConfig.defaultEmailTemplateId)
    );
    const dayTemplates = Object.entries(followUpConfig.templateIdByDay || {}).reduce(
      (acc, [day, id]) => {
        acc[day] = !!(id && Types.ObjectId.isValid(id));
        return acc;
      },
      {} as Record<string, boolean>,
    );

    if (sendMode === 'template') {
      if (!hasDefaultTemplate && Object.keys(dayTemplates).length === 0) {
        issues.push({
          type: 'error',
          message:
            'Template mode is enabled but NO email templates are configured',
          fix: 'Set either: (1) a default email template for all follow-ups, OR (2) day-specific templates',
        });
      } else if (!hasDefaultTemplate && Object.values(dayTemplates).some((v) => !v)) {
        issues.push({
          type: 'warning',
          message: `Some cadence days are missing templates: ${cadenceDays
            .filter((d) => dayTemplates[d] === false)
            .join(', ')}`,
          fix: 'Add templates for all cadence days, or set a default template as fallback',
        });
      }
    } else if (sendMode === 'ai_draft') {
      if (!followUpConfig.aiInstructions?.trim()) {
        issues.push({
          type: 'warning',
          message: 'AI draft mode enabled but no AI instructions provided',
          fix: 'Add custom instructions (optional) or leave empty for default AI behavior',
        });
      }
    }

    if (!issues.some((i) => i.type === 'error')) {
      issues.push({
        type: 'info',
        message: 'Follow-up configuration looks good!',
        fix: 'Emails should send after leads open the outreach email according to the cadence',
      });
    }

    return {
      status: issues.some((i) => i.type === 'error')
        ? 'error'
        : issues.some((i) => i.type === 'warning')
          ? 'warning'
          : 'ok',
      summary:
        issues.length > 0
          ? issues[0].message
          : 'Follow-up configuration is valid',
      template: {
        id: String(tpl._id),
        name: String(tpl.name),
        enabled: tpl.enabled !== false,
      },
      followUp: {
        enabled: followUpConfig.enabled,
        sendMode,
        cadenceDays,
        hasDefaultTemplate,
        daySpecificTemplates: dayTemplates,
        aiInstructions: followUpConfig.aiInstructions || null,
      },
      issues,
    };
  }
}
