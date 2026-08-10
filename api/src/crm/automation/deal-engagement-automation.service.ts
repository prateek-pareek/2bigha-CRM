import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Pipeline, PipelineDocument } from '../schemas/pipeline.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import {
  DealEngagementAutomationTemplate,
  DealEngagementAutomationTemplateDocument,
  DealEngagementAutomationRules,
} from '../schemas/deal-engagement-automation-template.schema';
import { DEAL_ENGAGEMENT_SYSTEM_PRESETS } from './deal-engagement-automation-presets';
import type {
  LeadEngagementStageTarget,
  LeadEngagementTaskAction,
} from '../schemas/lead-engagement-automation-template.schema';
import { PipelinesService } from '../core/pipelines.service';
import { resolveStageProbability } from '../shared/deal-stage-probability.util';

function normName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

@Injectable()
export class DealEngagementAutomationService implements OnModuleInit {
  private readonly logger = new Logger(DealEngagementAutomationService.name);

  constructor(
    @InjectModel(Deal.name, 'crmConnection')
    private readonly dealModel: Model<DealDocument>,
    @InjectModel(Pipeline.name, 'crmConnection')
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(DealEngagementAutomationTemplate.name, 'crmConnection')
    private readonly templateModel: Model<DealEngagementAutomationTemplateDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private readonly activityModel: Model<ActivityDocument>,
    private readonly pipelinesService: PipelinesService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedSystemTemplates();
    } catch (err) {
      this.logger.warn(
        `Skipped deal engagement template seed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async seedSystemTemplates(): Promise<void> {
    for (const preset of DEAL_ENGAGEMENT_SYSTEM_PRESETS) {
      const existing = await this.templateModel
        .findOne({ presetKey: preset.key, isSystem: true })
        .exec();
      const payload = {
        name: preset.name,
        description: preset.description,
        enabled: true,
        presetKey: preset.key,
        rules: preset.rules,
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

  private async applySuggestedPipelineAssignments(): Promise<void> {
    const templates = await this.templateModel
      .find({ isSystem: true })
      .lean()
      .exec();
    const dealPipelines = await this.pipelineModel
      .find({ $or: [{ type: 'deals' }, { type: { $exists: false } }] })
      .exec();
    for (const pipeline of dealPipelines) {
      if (pipeline.dealEngagementAutomationTemplateId) continue;
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
            { dealEngagementAutomationTemplateId: hit._id },
          )
          .exec();
      }
    }
  }

  async listTemplates() {
    return this.templateModel.find().sort({ isSystem: -1, name: 1 }).lean().exec();
  }

  async listPipelineAssignments() {
    const pipelines = await this.pipelinesService.findAll('deals');
    const templates = await this.templateModel.find().select('name').lean().exec();
    const nameById = new Map(templates.map((t) => [String(t._id), t.name]));
    return pipelines.map((p) => {
      const doc = p as PipelineDocument;
      const tid = doc.dealEngagementAutomationTemplateId
        ? String(doc.dealEngagementAutomationTemplateId)
        : null;
      return {
        pipelineId: String(doc._id),
        pipelineName: String(doc.name),
        templateId: tid,
        templateName: tid ? nameById.get(tid) || null : null,
      };
    });
  }

  async assignTemplateToPipeline(
    pipelineId: string,
    templateId: string | null,
  ) {
    if (!Types.ObjectId.isValid(pipelineId)) return null;
    if (templateId) {
      if (!Types.ObjectId.isValid(templateId)) return null;
      const tpl = await this.templateModel.findById(templateId).lean().exec();
      if (!tpl) throw new BadRequestException('Template not found');
    }
    return this.pipelineModel
      .findByIdAndUpdate(
        pipelineId,
        templateId
          ? {
              dealEngagementAutomationTemplateId: new Types.ObjectId(
                templateId,
              ),
            }
          : { $unset: { dealEngagementAutomationTemplateId: 1 } },
        { new: true },
      )
      .exec();
  }

  private async resolveTemplateForDeal(dealId: string) {
    if (!Types.ObjectId.isValid(dealId)) return null;
    const deal = await this.dealModel.findById(dealId).lean().exec();
    if (!deal) return null;
    let pipeline: Pipeline | null = null;
    const pid = (deal as { pipeline?: Types.ObjectId }).pipeline;
    if (pid && Types.ObjectId.isValid(String(pid))) {
      pipeline = await this.pipelineModel.findById(pid).lean().exec();
    }
    if (!pipeline) {
      pipeline = await this.pipelineModel
        .findOne({ $or: [{ type: 'deals' }, { type: { $exists: false } }] })
        .sort({ isDefault: -1, createdAt: 1 })
        .lean()
        .exec();
    }
    if (!pipeline?.dealEngagementAutomationTemplateId) return null;
    const tpl = await this.templateModel
      .findById(pipeline.dealEngagementAutomationTemplateId)
      .lean()
      .exec();
    if (!tpl || tpl.enabled === false) return null;
    return { doc: tpl, pipeline: pipeline as Pipeline, deal };
  }

  private passesStageGuard(
    deal: { stage?: string },
    onlyIfStages?: string[],
  ): boolean {
    if (!onlyIfStages?.length) return true;
    const cur = normName(String(deal.stage || ''));
    return onlyIfStages.some((s) => {
      const want = normName(s);
      return want === cur || cur.includes(want) || want.includes(cur);
    });
  }

  private async createTaskForDeal(
    dealId: Types.ObjectId,
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
    const deal = await this.dealModel
      .findById(dealId)
      .select('dealOwner')
      .lean()
      .exec();
    const title = String(task.title || '').trim() || 'Automation task';
    const body = task.body?.trim() || '';
    const content = body ? `${title}\n\n${body}` : title;
    await new this.activityModel({
      type: 'Task',
      title,
      content,
      relatedTo: dealId,
      relatedType: 'Deal',
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
          (deal as { dealOwner?: string } | null)?.dealOwner || '',
        ).trim(),
        remindersSent: [],
        dealEngagementAutomation: true,
      },
    }).save();
  }

  private async applyStageTarget(
    dealId: string,
    target: LeadEngagementStageTarget | undefined,
    pipeline: Pipeline,
  ): Promise<boolean> {
    if (!target?.stageName?.trim()) return false;
    const stageToSet = stageMatches(pipeline, target.stageName);
    if (!stageToSet) return false;
    const probability = resolveStageProbability(
      pipeline.stages,
      stageToSet,
      0,
    );
    await this.dealModel
      .findByIdAndUpdate(dealId, { stage: stageToSet, probability })
      .exec();
    return true;
  }

  async onDealEmailOpened(dealId: string): Promise<void> {
    try {
      const ctx = await this.resolveTemplateForDeal(dealId);
      const rule = ctx?.doc.rules.onEmailOpened;
      if (!ctx || !rule) return;
      if (!this.passesStageGuard(ctx.deal as { stage?: string }, rule.onlyIfStages)) {
        return;
      }
      await this.applyStageTarget(dealId, rule, ctx.pipeline);
      if (rule.createTask) {
        await this.createTaskForDeal(
          new Types.ObjectId(dealId),
          rule.createTask,
        );
      }
    } catch (err) {
      this.logger.warn(
        `onDealEmailOpened(${dealId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onDealEmailReply(dealId: string): Promise<void> {
    try {
      const ctx = await this.resolveTemplateForDeal(dealId);
      const rule = ctx?.doc.rules.onReply;
      if (!ctx || !rule) return;
      await this.applyStageTarget(dealId, rule, ctx.pipeline);
      if (rule.createTask) {
        await this.createTaskForDeal(
          new Types.ObjectId(dealId),
          rule.createTask,
        );
      }
    } catch (err) {
      this.logger.warn(
        `onDealEmailReply(${dealId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onDealStageChanged(
    dealId: string,
    newStage: string,
    previousStage?: string,
  ): Promise<void> {
    try {
      const ctx = await this.resolveTemplateForDeal(dealId);
      const rule = ctx?.doc.rules.onDealStageEntered;
      if (!ctx || !rule) return;
      const want = normName(rule.stageName);
      const got = normName(newStage);
      if (want !== got && !got.includes(want) && !want.includes(got)) return;
      if (
        previousStage &&
        normName(previousStage) === got
      ) {
        return;
      }
      if (rule.createTask) {
        await this.createTaskForDeal(
          new Types.ObjectId(dealId),
          rule.createTask,
        );
      }
    } catch (err) {
      this.logger.warn(
        `onDealStageChanged(${dealId}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
