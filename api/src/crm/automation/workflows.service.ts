import { createHash } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Model, Types } from 'mongoose';
import { TeamsBotService } from '../../teams-bot/teams-bot.service';
import { EmailTemplatesService } from '../email/email-templates.service';
import { EmailTemplateMergeService } from '../email/email-template-merge.service';
import { InboxAccountsService } from '../inbox/inbox-accounts.service';
import { softDeleteUpdate } from '../shared/crm-soft-delete.util';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { Activity, ActivityDocument } from '../schemas/activity.schema';
import {
  Workflow,
  WorkflowDocument,
  WorkflowTrigger,
  WorkflowTriggerCombine,
  WorkflowFilter,
  WorkflowAction,
  WorkflowStep,
  WorkflowBranch,
  WorkflowActionStep,
  WorkflowWaitEmailOpenStep,
  WorkflowMailboxSplitMode,
} from '../schemas/workflow.schema';
import {
  WorkflowTriggerProgress,
  WorkflowTriggerProgressDocument,
} from '../schemas/workflow-trigger-progress.schema';
import {
  WorkflowSplitCounter,
  WorkflowSplitCounterDocument,
} from '../schemas/workflow-split-counter.schema';
import {
  WorkflowExecution,
  WorkflowExecutionDocument,
} from '../schemas/workflow-execution.schema';
import {
  WorkflowEnrollment,
  WorkflowEnrollmentDocument,
} from '../schemas/workflow-enrollment.schema';
import {
  WorkflowDelayedJob,
  WorkflowDelayedJobDocument,
  WorkflowEntityType,
} from '../schemas/workflow-delayed-job.schema';
import {
  WorkflowGoalHit,
  WorkflowGoalHitDocument,
} from '../schemas/workflow-goal-hit.schema';
import {
  CrmGlobalSettings,
  CrmGlobalSettingsDocument,
} from '../schemas/crm-global-settings.schema';
import { EmailTrackingService } from '../email/email-tracking.service';
import { LeadEngagementAutomationService } from './lead-engagement-automation.service';
import { CrmSegmentsService } from '../segments/crm-segments.service';
import { CrmAiService } from '../ai/crm-ai.service';
import {
  WORKFLOW_CANVAS_START_ID,
  WORKFLOW_EMAIL_WAIT_OPEN_END_ID,
} from './workflow-canvas.types';
import type {
  WorkflowCanvasEdge,
  WorkflowCanvasGraph,
} from './workflow-canvas.types';
import {
  buildNodeMap,
  outgoingEdges,
  pickAbVariant,
  pickEdge,
  resolveWaitEmailOutgoingEdges,
} from './workflow-canvas.runtime';

export type WorkflowDispatchEvent = {
  trigger: WorkflowTrigger;
  entityType: WorkflowEntityType;
  entityId: Types.ObjectId;
  record: Record<string, unknown>;
  previous?: Record<string, unknown> | null;
  user?: {
    userId?: string;
    _id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
};

function getAtPath(
  obj: Record<string, unknown> | null | undefined,
  path: string,
): unknown {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/** Normalize ObjectId / populated refs so pipeline filters match string values from the UI. */
function normalizeComparable(v: unknown): string {
  if (v == null) return '';
  if (
    typeof v === 'object' &&
    v !== null &&
    '_id' in (v as Record<string, unknown>)
  ) {
    return String((v as { _id: unknown })._id)
      .trim()
      .toLowerCase();
  }
  const s = String(v).trim();
  if (/^[0-9a-fA-F]{24}$/.test(s)) return s.toLowerCase();
  return s.toLowerCase();
}

function compareVals(
  a: unknown,
  b: string | number | boolean | undefined,
): boolean {
  if (b === undefined) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    return Number(a) === Number(b);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  return normalizeComparable(a) === normalizeComparable(b);
}

function parseList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v))
    return v.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  return String(v)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function enrollmentOnce(wf: Workflow): boolean {
  if (wf.enrollmentPolicy === 'once') return true;
  if (wf.enrollmentPolicy === 'every_time') return false;
  return !!wf.onlyOncePerRecord;
}

function normalizeBranches(wf: Workflow): WorkflowBranch[] {
  if (wf.branches && wf.branches.length > 0) {
    return wf.branches;
  }
  const legacy = wf.actions || [];
  if (legacy.length === 0) {
    return [
      {
        label: 'Main path',
        filters: [],
        steps: [],
      },
    ];
  }
  return [
    {
      label: 'Main path',
      filters: [],
      steps: legacy.map((a) => ({ type: 'action' as const, action: a })),
    },
  ];
}

function delayMs(d: {
  days?: number;
  hours?: number;
  minutes?: number;
}): number {
  const days = Number(d.days) || 0;
  const hours = Number(d.hours) || 0;
  const minutes = Number(d.minutes) || 0;
  return (days * 86400 + hours * 3600 + minutes * 60) * 1000;
}

function msToDelayParts(ms: number): {
  days: number;
  hours: number;
  minutes: number;
} {
  let remaining = Math.max(0, Math.floor(ms));
  const days = Math.floor(remaining / 86400000);
  remaining %= 86400000;
  const hours = Math.floor(remaining / 3600000);
  remaining %= 3600000;
  const minutes = Math.floor(remaining / 60000);
  return { days, hours, minutes };
}

/** Wait before a follow-up step: absolute `scheduledAt` or relative delay fields. */
function resolveFollowUpStepDelayMs(
  s: FollowUpSequenceStepDto,
  cursorMs: number,
): number {
  if (s.scheduledAt) {
    const t = new Date(s.scheduledAt).getTime();
    if (!Number.isFinite(t)) {
      return 0;
    }
    return Math.max(0, t - cursorMs);
  }
  return delayMs({
    days: s.delayDays,
    hours: s.delayHours,
    minutes: s.delayMinutes,
  });
}

/** Mutable per-run state (threaded through actions and persisted on delayed jobs). */
export type WorkflowRunContext = {
  lastEmailTrackingToken?: string;
  sequenceStartedAt?: Date;
  cancelOnReply?: boolean;
  /** Follow-up sequence: force all sends through this inbox account. */
  lockedInboxAccountId?: string;
  /** Active MongoDB delayed-job row (resume after deploy). */
  workflowDelayedJobId?: string;
  /** Defer cadence delays until first/alternate outreach is opened. */
  cadenceStartsAfterOpen?: boolean;
  followUpSequenceStepDtos?: FollowUpSequenceStepDto[];
  alternateEngagementSteps?: FollowUpNotOpenedResendDto[];
  /** Index of the alternate step currently being sent (open-tracking branch). */
  alternateEngagementStepIndex?: number;
  firstEngagementWait?: FollowUpNotOpenedResendDto;
};

const SYSTEM_FOLLOW_UP_WORKFLOW_NAME = '__scheduled_follow_up__';
const FOLLOW_UP_AUTO_RECOVERY_NOTE =
  'Automatic recovery — alternate send missed after open deadline';
const MAX_FOLLOW_UP_AUTO_RECOVERY_ATTEMPTS = 2;

export type FollowUpNotOpenedResendDto = {
  waitDays?: number;
  waitHours?: number;
  waitMinutes?: number;
  deadlineAt?: string;
  sendMode?: 'template' | 'custom' | 'ai_draft';
  templateId?: string;
  subject?: string;
  body?: string;
  aiInstructions?: string;
  inboxAccountId?: string;
};

export type FirstOutreachEngagementDto = {
  firstWait?: FollowUpNotOpenedResendDto;
  alternateSteps: FollowUpNotOpenedResendDto[];
};

export type FollowUpSequenceStepDto = {
  /** @deprecated Use `email.templateId` */
  templateId?: string;
  delayDays?: number;
  delayHours?: number;
  delayMinutes?: number;
  /** ISO datetime — wait until this time (relative to previous step cursor). */
  scheduledAt?: string;
  /** Per-step send mailbox; falls back to outreach / sequence default when omitted. */
  inboxAccountId?: string;
  email?: {
    sendMode?: 'template' | 'custom' | 'ai_draft';
    templateId?: string;
    subject?: string;
    body?: string;
    aiInstructions?: string;
    inboxAccountId?: string;
    /** @deprecated Use sequence-level `firstOutreachIfNotOpened` */
    ifNotOpened?: FollowUpNotOpenedResendDto;
  };
  task?: { title: string; body?: string; dueInDays?: number };
};

function isActionStep(s: WorkflowStep): s is WorkflowActionStep {
  return (s as WorkflowActionStep).type === 'action';
}

function isDelayStep(s: WorkflowStep): boolean {
  return (s as { type?: string }).type === 'delay';
}

function isWaitEmailOpenStep(s: WorkflowStep): s is WorkflowWaitEmailOpenStep {
  return (s as { type?: string }).type === 'wait_email_open';
}

function resolveWaitEmailOpenDeadlineMs(step: WorkflowWaitEmailOpenStep): number {
  if (step.deadlineAt) {
    const t = new Date(step.deadlineAt).getTime();
    if (Number.isFinite(t)) {
      return Math.max(60_000, t - Date.now());
    }
  }
  return delayMs({
    days: step.waitDays,
    hours: step.waitHours,
    minutes: step.waitMinutes,
  });
}

const WORKFLOW_CRON_JOB_NAME = 'workflow-delayed-jobs';
const WORKFLOW_MAINTENANCE_CRON_JOB_NAME = 'workflow-maintenance';
const WORKFLOW_SCHEDULER_CACHE_MS = 60_000;
const WORKFLOW_NUDGE_DUE_JOBS_MIN_MS = 45_000;

@Injectable()
export class WorkflowsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowsService.name);
  private workflowSchedulerEnabledCache: {
    value: boolean;
    expiresAt: number;
  } | null = null;
  private processingDueJobs = false;
  private processDueJobsQueued = false;
  private lastNudgedDueJobsAt = 0;
  private runningMaintenance = false;

  constructor(
    @InjectModel(Workflow.name, 'crmConnection')
    private workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowExecution.name, 'crmConnection')
    private executionModel: Model<WorkflowExecutionDocument>,
    @InjectModel(WorkflowEnrollment.name, 'crmConnection')
    private enrollmentModel: Model<WorkflowEnrollmentDocument>,
    @InjectModel(WorkflowDelayedJob.name, 'crmConnection')
    private delayedJobModel: Model<WorkflowDelayedJobDocument>,
    @InjectModel(WorkflowSplitCounter.name, 'crmConnection')
    private splitCounterModel: Model<WorkflowSplitCounterDocument>,
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private organizationModel: Model<OrganizationDocument>,
    @InjectModel(Activity.name, 'crmConnection')
    private activityModel: Model<ActivityDocument>,
    @InjectModel(WorkflowGoalHit.name, 'crmConnection')
    private goalHitModel: Model<WorkflowGoalHitDocument>,
    @InjectModel(WorkflowTriggerProgress.name, 'crmConnection')
    private triggerProgressModel: Model<WorkflowTriggerProgressDocument>,
    private readonly teamsBotService: TeamsBotService,
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly emailTemplateMergeService: EmailTemplateMergeService,
    @Inject(forwardRef(() => CrmAiService))
    private readonly crmAiService: CrmAiService,
    @Inject(forwardRef(() => InboxAccountsService))
    private readonly inboxAccountsService: InboxAccountsService,
    @Inject(forwardRef(() => EmailTrackingService))
    private readonly emailTrackingService: EmailTrackingService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectModel(CrmGlobalSettings.name, 'crmConnection')
    private readonly globalSettingsModel: Model<CrmGlobalSettingsDocument>,
    @Inject(forwardRef(() => LeadEngagementAutomationService))
    private readonly leadEngagementAutomation: LeadEngagementAutomationService,
    @Inject(forwardRef(() => CrmSegmentsService))
    private readonly segmentsService: CrmSegmentsService,
  ) {}

  /** CRM Settings → Workflows: delayed job runner on/off (default on when unset). */
  private async isWorkflowSchedulerEnabled(): Promise<boolean> {
    const now = Date.now();
    if (
      this.workflowSchedulerEnabledCache &&
      this.workflowSchedulerEnabledCache.expiresAt > now
    ) {
      return this.workflowSchedulerEnabledCache.value;
    }
    const doc = await this.globalSettingsModel
      .findOne({ key: 'default' })
      .select('workflowSchedulerEnabled')
      .lean()
      .exec();
    const value = doc?.workflowSchedulerEnabled !== false;
    this.workflowSchedulerEnabledCache = {
      value,
      expiresAt: now + WORKFLOW_SCHEDULER_CACHE_MS,
    };
    return value;
  }

  onModuleInit(): void {
    const expression =
      this.configService.get<string>('WORKFLOW_CRON') ?? '*/60 * * * * *';
    const dueJob = new CronJob(
      expression,
      () => {
        void this.processDueDelayedJobs();
      },
      null,
      true,
    );
    this.schedulerRegistry.addCronJob(WORKFLOW_CRON_JOB_NAME, dueJob);

    const maintenanceExpression =
      this.configService.get<string>('WORKFLOW_MAINTENANCE_CRON') ??
      '0 */10 * * * *';
    const maintenanceJob = new CronJob(
      maintenanceExpression,
      () => {
        void this.runWorkflowMaintenanceTasks();
      },
      null,
      true,
    );
    this.schedulerRegistry.addCronJob(
      WORKFLOW_MAINTENANCE_CRON_JOB_NAME,
      maintenanceJob,
    );

    this.logger.log(
      `[Workflows] delayed-job processor scheduled (${expression}; batch WORKFLOW_JOBS_PER_TICK=${this.getJobsPerTick()}; maintenance ${maintenanceExpression}; on/off via CRM Settings only)`,
    );
    setImmediate(() => {
      void this.bootstrapWorkflowSchedulerAfterStartup();
    });
  }

  /**
   * After deploy/restart: reclaim jobs stuck in `processing`, then run any due work
   * already stored in MongoDB (runAt <= now). Schedules are never held only in memory.
   */
  private async bootstrapWorkflowSchedulerAfterStartup(): Promise<void> {
    try {
      const reclaimed = await this.reclaimInterruptedProcessingJobs();
      const dueCount = await this.delayedJobModel.countDocuments({
        status: 'pending',
        runAt: { $lte: new Date() },
      });
      if (reclaimed > 0 || dueCount > 0) {
        this.logger.log(
          `[Workflows] startup DB queue: reclaimed ${reclaimed} interrupted job(s), ${dueCount} due now`,
        );
      }
      if (await this.isWorkflowSchedulerEnabled()) {
        await this.recoverOpenedAndMisboundEmailWaitJobs();
        await this.processDueDelayedJobs();
      } else if (dueCount > 0) {
        this.logger.log(
          '[Workflows] startup: scheduled runs paused in CRM Settings — due jobs will run when re-enabled',
        );
      }
    } catch (e: unknown) {
      this.logger.error(
        `[Workflows] startup bootstrap failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Any `processing` row is orphaned after a crash/deploy — return to `pending` with same runAt. */
  private async reclaimInterruptedProcessingJobs(): Promise<number> {
    const r = await this.delayedJobModel
      .updateMany(
        { status: 'processing' },
        { $set: { status: 'pending' } },
      )
      .exec();
    return r.modifiedCount ?? 0;
  }

  onModuleDestroy(): void {
    for (const name of [
      WORKFLOW_CRON_JOB_NAME,
      WORKFLOW_MAINTENANCE_CRON_JOB_NAME,
    ]) {
      try {
        this.schedulerRegistry.getCronJob(name).stop();
      } catch {
        /* not registered */
      }
    }
  }

  private nudgeDueDelayedJobsIfIdle(): void {
    const now = Date.now();
    if (now - this.lastNudgedDueJobsAt < WORKFLOW_NUDGE_DUE_JOBS_MIN_MS) {
      return;
    }
    this.lastNudgedDueJobsAt = now;
    void this.processDueDelayedJobs();
  }

  /**
   * Advance pending open-wait jobs immediately when their tracked email is opened,
   * instead of waiting up to the next 5-minute poll.
   * Only matches emailWait rows — never canvas/branch delay jobs that share lastEmailTrackingToken.
   */
  async nudgeEmailWaitJobsForTrackingToken(
    trackingToken: string,
  ): Promise<number> {
    const token = String(trackingToken || '').trim();
    if (!token || token === '__no_token__') return 0;
    const now = new Date();
    const res = await this.delayedJobModel
      .updateMany(
        {
          status: 'pending',
          'emailWait.trackingToken': token,
        },
        { $set: { runAt: now } },
      )
      .exec();
    const matched = Number(res.modifiedCount || res.matchedCount || 0);
    if (matched > 0) {
      this.nudgeDueDelayedJobsIfIdle();
    }
    return matched;
  }

  private getJobsPerTick(): number {
    const raw =
      this.configService.get<string>('WORKFLOW_JOBS_PER_TICK') ?? '50';
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return 50;
    return Math.min(200, Math.max(1, n));
  }

  private getStaleProcessingMinutes(): number {
    const raw =
      this.configService.get<string>('WORKFLOW_STALE_PROCESSING_MINUTES') ??
      '30';
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return 30;
    return Math.min(24 * 60, Math.max(5, n));
  }

  private requiredTriggers(
    wf: Workflow & { triggers?: WorkflowTrigger[] },
  ): WorkflowTrigger[] {
    return [
      ...new Set([
        wf.trigger,
        ...((wf.triggers || []) as WorkflowTrigger[]),
      ]),
    ];
  }

  private usesTriggerAllCombine(
    wf: Workflow & { triggerCombine?: WorkflowTriggerCombine },
  ): boolean {
    return (
      wf.triggerCombine === 'all' && this.requiredTriggers(wf).length > 1
    );
  }

  async create(
    dto: Partial<Workflow>,
    userId?: string,
  ): Promise<WorkflowDocument> {
    const doc = new this.workflowModel({
      ...dto,
      createdBy:
        userId && Types.ObjectId.isValid(userId)
          ? new Types.ObjectId(userId)
          : undefined,
    });
    return doc.save();
  }

  async findAll(): Promise<Workflow[]> {
    return this.workflowModel
      .find({ name: { $ne: SYSTEM_FOLLOW_UP_WORKFLOW_NAME } })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string): Promise<WorkflowDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.workflowModel.findById(id).exec();
  }

  async update(
    id: string,
    dto: Partial<Workflow>,
  ): Promise<WorkflowDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const updated = await this.workflowModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (updated && dto.enabled === false) {
      await this.cancelPendingJobsForWorkflow(
        id,
        'Workflow disabled',
      );
    }
    return updated;
  }

  async remove(id: string, deletedBy?: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const r = await this.workflowModel
      .findByIdAndUpdate(id, softDeleteUpdate(deletedBy), { new: true })
      .exec();
    if (r) {
      await this.cancelPendingJobsForWorkflow(id, 'Workflow moved to trash');
    }
    return !!r;
  }

  private async cancelPendingJobsForWorkflow(
    workflowId: string,
    reason: string,
  ): Promise<number> {
    if (!Types.ObjectId.isValid(workflowId)) return 0;
    const wfOid = new Types.ObjectId(workflowId);
    const r = await this.delayedJobModel
      .updateMany(
        {
          workflowId: wfOid,
          status: { $in: ['pending', 'processing'] },
        },
        { $set: { status: 'cancelled', cancelReason: reason } },
      )
      .exec();
    return r.modifiedCount ?? 0;
  }

  async listExecutions(
    workflowId?: string,
    limit = 100,
    /** When set, only executions with createdAt on or after now − days (UTC). */
    days?: number,
  ): Promise<WorkflowExecution[]> {
    const q: Record<string, unknown> = {};
    if (workflowId && Types.ObjectId.isValid(workflowId)) {
      q.workflowId = new Types.ObjectId(workflowId);
    }
    if (days != null && days > 0) {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - Math.min(366, Math.floor(days)));
      q.createdAt = { $gte: since };
    }
    return this.executionModel
      .find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  async getAnalytics(workflowId: string): Promise<{
    executionsByVariant: { A?: number; B?: number; unknown?: number };
    goalHits: number;
    successfulRuns: number;
  }> {
    if (!Types.ObjectId.isValid(workflowId)) {
      return { executionsByVariant: {}, goalHits: 0, successfulRuns: 0 };
    }
    const wid = new Types.ObjectId(workflowId);
    const [variants, goalHits, successfulRuns] = await Promise.all([
      this.executionModel.aggregate<{ _id: string | null; c: number }>([
        { $match: { workflowId: wid, status: 'success' } },
        { $group: { _id: '$variant', c: { $sum: 1 } } },
      ]),
      this.goalHitModel.countDocuments({ workflowId: wid }),
      this.executionModel.countDocuments({
        workflowId: wid,
        status: 'success',
      }),
    ]);
    const executionsByVariant: { A?: number; B?: number; unknown?: number } =
      {};
    for (const row of variants) {
      const k = row._id === 'A' || row._id === 'B' ? row._id : 'unknown';
      executionsByVariant[k] = (executionsByVariant[k] || 0) + row.c;
    }
    return { executionsByVariant, goalHits, successfulRuns };
  }

  /** Pending delayed sends for a lead/contact (follow-up queue). */
  async listPendingJobsForEntity(
    entityType: WorkflowEntityType,
    entityId: string,
  ): Promise<
    Array<{
      _id: string;
      workflowId: string;
      runAt: string;
      status: string;
      cancelOnReply?: boolean;
      cancelReason?: string;
      branchLabel?: string;
    }>
  > {
    if (!Types.ObjectId.isValid(entityId)) return [];
    const rows = await this.delayedJobModel
      .find({
        entityType,
        entityId: new Types.ObjectId(entityId),
        status: 'pending',
      })
      .sort({ runAt: 1 })
      .lean()
      .exec();
    return rows.map((r) => ({
      _id: String(r._id),
      workflowId: String(r.workflowId),
      runAt: new Date(r.runAt).toISOString(),
      status: r.status,
      cancelOnReply: r.cancelOnReply,
      cancelReason: r.cancelReason,
      branchLabel: r.branchLabel,
    }));
  }

  /** Full projected follow-up timeline for lead/contact sidebar card. */
  private async resolveFollowUpJobsForEntity(
    entityType: WorkflowEntityType,
    entityId: string,
  ): Promise<{
    pendingJobs: WorkflowDelayedJob[];
    recentTerminalJob: WorkflowDelayedJob | null;
  }> {
    const entityOid = new Types.ObjectId(entityId);
    const pendingJobs = await this.delayedJobModel
      .find({
        entityType,
        entityId: entityOid,
        status: 'pending',
        branchLabel: 'Follow-up sequence',
      })
      .sort({ runAt: 1 })
      .lean()
      .exec();

    if (pendingJobs.length > 0) {
      return {
        pendingJobs: pendingJobs as WorkflowDelayedJob[],
        recentTerminalJob: null,
      };
    }

    const recentTerminalJob = await this.delayedJobModel
      .findOne({
        entityType,
        entityId: entityOid,
        branchLabel: 'Follow-up sequence',
        status: { $in: ['done', 'failed'] },
      })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    return {
      pendingJobs: [],
      recentTerminalJob: (recentTerminalJob as WorkflowDelayedJob | null) ?? null,
    };
  }

  private resolveFollowUpEditableConfigFromJobs(
    jobs: Array<{
      cancelOnReply?: boolean;
      emailWait?: WorkflowDelayedJob['emailWait'];
      followUpCadenceSteps?: unknown[];
      engagementAlternateSteps?: unknown[];
    }>,
  ): {
    cancelOnReply: boolean;
    firstOutreachEngagement: FirstOutreachEngagementDto | null;
    steps: FollowUpSequenceStepDto[];
  } | null {
    if (!jobs.length) return null;
    return this.buildEditableFollowUpConfigFromPendingJobs(jobs);
  }

  async getFollowUpRetryEligibility(
    entityType: WorkflowEntityType,
    entityId: string,
    pendingJobs: WorkflowDelayedJob[],
    recentTerminalJob: WorkflowDelayedJob | null,
    editableConfig: {
      firstOutreachEngagement: FirstOutreachEngagementDto | null;
    } | null,
    options?: { forAutoRecovery?: boolean },
  ): Promise<{
    eligible: boolean;
    alternateStepCount: number;
    reason?: string;
  }> {
    const altSteps =
      editableConfig?.firstOutreachEngagement?.alternateSteps || [];
    const alternateStepCount = altSteps.length;
    if (!alternateStepCount) {
      return { eligible: false, alternateStepCount: 0 };
    }

    const jobsToInspect = [
      ...pendingJobs,
      ...(recentTerminalJob ? [recentTerminalJob] : []),
    ];
    if (!jobsToInspect.length) {
      return { eligible: false, alternateStepCount };
    }

    let deadlinePassed = false;
    let alternatesExpected = false;
    let sequenceStartedAt: Date | null = null;

    for (const job of jobsToInspect) {
      const ew = job.emailWait;
      if (ew?.deadlineAt) {
        const deadlineMs = new Date(ew.deadlineAt).getTime();
        if (Number.isFinite(deadlineMs) && deadlineMs <= Date.now()) {
          deadlinePassed = true;
        }
      }
      if (ew?.firstOutreachGate) alternatesExpected = true;
      if (this.accumulatedResultsExpectAlternates(job.accumulatedResults)) {
        alternatesExpected = true;
      }
      const started =
        job.sequenceStartedAt != null
          ? new Date(job.sequenceStartedAt)
          : (job as WorkflowDelayedJob & { createdAt?: Date }).createdAt
            ? new Date((job as WorkflowDelayedJob & { createdAt?: Date }).createdAt!)
            : null;
      if (started && !Number.isNaN(started.getTime())) {
        if (!sequenceStartedAt || started < sequenceStartedAt) {
          sequenceStartedAt = started;
        }
      }
    }

    if (!deadlinePassed && !alternatesExpected) {
      return { eligible: false, alternateStepCount };
    }

    const entityOid = new Types.ObjectId(entityId);
    const altAlreadySent = await this.activityModel
      .findOne({
        relatedTo: entityOid,
        relatedType: entityType,
        type: 'Email',
        'metadata.workflowEmailSend': true,
        'metadata.alternateEngagementStep': { $exists: true, $gte: 0 },
        ...(sequenceStartedAt
          ? { createdAt: { $gte: sequenceStartedAt } }
          : {}),
      })
      .select('_id')
      .lean()
      .exec();
    if (altAlreadySent) {
      return { eligible: false, alternateStepCount };
    }

    const alternateSentInResults = jobsToInspect.some((job) =>
      (job.accumulatedResults || []).some(
        (r) =>
          /^Email sent/i.test(String(r)) &&
          /alternate step|Manual retry/i.test(String(r)),
      ),
    );
    if (alternateSentInResults) {
      return { eligible: false, alternateStepCount };
    }

    const permanentErr = this.terminalJobPermanentSendFailure(jobsToInspect);
    if (options?.forAutoRecovery) {
      const autoAttempts = Math.max(
        0,
        ...jobsToInspect.map((job) =>
          this.countAutomaticRecoveryAttempts(job.accumulatedResults),
        ),
      );
      if (autoAttempts >= MAX_FOLLOW_UP_AUTO_RECOVERY_ATTEMPTS) {
        return {
          eligible: false,
          alternateStepCount,
          reason:
            'Automatic recovery already attempted multiple times without a successful send.',
        };
      }
      if (permanentErr) {
        return {
          eligible: false,
          alternateStepCount,
          reason: `Cannot auto-recover: ${permanentErr}`,
        };
      }
      const missingAccounts = await this.findMissingAlternateMailboxIds(altSteps);
      if (missingAccounts.length > 0) {
        return {
          eligible: false,
          alternateStepCount,
          reason:
            'Alternate mailbox not found. Reconnect the inbox account and retry manually.',
        };
      }
    }

    return {
      eligible: true,
      alternateStepCount,
      reason: permanentErr
        ? `Last send failed: ${permanentErr}. Reconnect the mailbox, then use Retry.`
        : 'First outreach was not opened; the alternate mailbox send did not run. Retry to send it now.',
    };
  }

  async getFollowUpScheduleForEntity(
    entityType: WorkflowEntityType,
    entityId: string,
  ): Promise<{
    hasSchedule: boolean;
    cancelOnReply: boolean;
    steps: Array<{
      scheduledAt: string;
      kind: 'email' | 'task' | 'wait';
      label: string;
      templateId: string | null;
      templateName: string | null;
      taskDueInDays?: number;
    }>;
    nextScheduledAt: string | null;
    pendingJobCount: number;
    editableConfig: {
      cancelOnReply: boolean;
      firstOutreachEngagement: FirstOutreachEngagementDto | null;
      steps: FollowUpSequenceStepDto[];
    } | null;
    retryAlternates: {
      eligible: boolean;
      alternateStepCount: number;
      reason?: string;
    };
  }> {
    const emptySteps: Array<{
      scheduledAt: string;
      kind: 'email' | 'task' | 'wait';
      label: string;
      templateId: string | null;
      templateName: string | null;
      taskDueInDays?: number;
    }> = [];
    const emptyEditableConfig = null as {
      cancelOnReply: boolean;
      firstOutreachEngagement: FirstOutreachEngagementDto | null;
      steps: FollowUpSequenceStepDto[];
    } | null;

    if (!Types.ObjectId.isValid(entityId)) {
      return {
        hasSchedule: false,
        cancelOnReply: true,
        steps: emptySteps,
        nextScheduledAt: null,
        pendingJobCount: 0,
        editableConfig: emptyEditableConfig,
        retryAlternates: { eligible: false, alternateStepCount: 0 },
      };
    }

    const { pendingJobs, recentTerminalJob } =
      await this.resolveFollowUpJobsForEntity(entityType, entityId);
    const configSourceJobs = pendingJobs.length
      ? pendingJobs
      : recentTerminalJob
        ? [recentTerminalJob]
        : [];
    const editableConfig =
      this.resolveFollowUpEditableConfigFromJobs(configSourceJobs);
    const retryAlternates = await this.getFollowUpRetryEligibility(
      entityType,
      entityId,
      pendingJobs,
      recentTerminalJob,
      editableConfig,
    );

    if (!pendingJobs.length) {
      return {
        hasSchedule: false,
        cancelOnReply: editableConfig?.cancelOnReply ?? true,
        steps: emptySteps,
        nextScheduledAt: null,
        pendingJobCount: 0,
        editableConfig,
        retryAlternates,
      };
    }

    // Heal sequences that should have stopped on reply but missed inbox cancel
    // (e.g. relatedTo ObjectId mismatch in the pre-send check).
    const cancelOnReplyJobs = pendingJobs.filter((j) => j.cancelOnReply !== false);
    if (cancelOnReplyJobs.length) {
      let since = new Date(0);
      for (const job of cancelOnReplyJobs) {
        const started =
          job.sequenceStartedAt != null
            ? new Date(job.sequenceStartedAt)
            : (job as { createdAt?: Date | string }).createdAt
              ? new Date((job as { createdAt?: Date | string }).createdAt as Date | string)
              : null;
        if (started && Number.isFinite(started.getTime())) {
          if (since.getTime() === 0 || started < since) since = started;
        }
      }
      if (
        await this.hasInboundReplySince(
          entityType,
          new Types.ObjectId(entityId),
          since,
        )
      ) {
        await this.cancelPendingJobsOnReply(
          entityType === 'Lead'
            ? 'leads'
            : entityType === 'Contact'
              ? 'contacts'
              : 'leads',
          entityId,
          'Recipient replied',
        );
        return {
          hasSchedule: false,
          cancelOnReply: editableConfig?.cancelOnReply ?? true,
          steps: emptySteps,
          nextScheduledAt: null,
          pendingJobCount: 0,
          editableConfig,
          retryAlternates: { eligible: false, alternateStepCount: 0 },
        };
      }
    }

    const jobs = pendingJobs;

    let cancelOnReply = true;
    const projected: Array<{
      scheduledAt: string;
      kind: 'email' | 'task' | 'wait';
      label: string;
      templateId: string | null;
      taskDueInDays?: number;
    }> = [];

    const hasDueNow = jobs.some(
      (j) => new Date(j.runAt).getTime() <= Date.now(),
    );
    if (hasDueNow && (await this.isWorkflowSchedulerEnabled())) {
      this.nudgeDueDelayedJobsIfIdle();
    }

    for (const job of jobs) {
      if (job.cancelOnReply === false) cancelOnReply = false;
      const ew = job.emailWait as WorkflowDelayedJob['emailWait'] | undefined;
      if (ew?.branchMode && ew.deadlineAt) {
        projected.push({
          scheduledAt: new Date(job.runAt).toISOString(),
          kind: 'wait',
          label: `Wait for open (deadline ${new Date(ew.deadlineAt).toLocaleString('en-US', { timeZone: process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })})`,
          templateId: null,
        });
        const altSteps = this.resolveEngagementAlternateSteps({
          emailWait: ew,
          engagementAlternateSteps: job.engagementAlternateSteps,
        });
        if (altSteps.length > 0) {
          let altCursor = new Date(ew.deadlineAt).getTime();
          for (let i = 0; i < altSteps.length; i++) {
            const alt = altSteps[i];
            const altRaw = alt.inboxAccountId?.trim();
            const altAction =
              altRaw && Types.ObjectId.isValid(altRaw)
                ? this.buildFollowUpEmailAction(alt, altRaw)
                : null;
            if (altAction?.type === 'send_email_template') {
              const custom =
                altAction.sendMode === 'custom' ||
                (!altAction.templateId && !!altAction.subject?.trim());
              projected.push({
                scheduledAt: new Date(altCursor).toISOString(),
                kind: 'email',
                label: custom
                  ? String(altAction.subject || `Alternate email ${i + 1}`).trim().slice(0, 80)
                  : `Alternate email ${i + 1} (if not opened)`,
                templateId:
                  !custom && altAction.templateId
                    ? String(altAction.templateId)
                    : null,
              });
            }
            altCursor += Math.max(
              60_000,
              this.resolveNotOpenedWaitMs(alt),
            );
          }
        }
      }
      projected.push(
        ...this.projectScheduledStepsFromDelayedJob(job, ew),
      );
    }

    projected.sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );

    const tplIds = [
      ...new Set(
        projected
          .filter((s) => s.kind === 'email' && s.templateId)
          .map((s) => s.templateId as string),
      ),
    ];
    const nameById = new Map<string, string>();
    for (const id of tplIds) {
      if (!Types.ObjectId.isValid(id)) continue;
      const tpl = await this.emailTemplatesService.findOne(id);
      if (tpl?.name) nameById.set(id, String(tpl.name));
    }

    const steps = projected.map((s) => ({
      scheduledAt: s.scheduledAt,
      kind: s.kind,
      label:
        s.kind === 'email' && s.templateId
          ? nameById.get(s.templateId) ?? s.label
          : s.label,
      templateId: s.templateId,
      templateName:
        s.kind === 'email' && s.templateId
          ? nameById.get(s.templateId) ?? 'Email template'
          : null,
      taskDueInDays: s.taskDueInDays,
    }));

    const firstJobRun = jobs[0]?.runAt
      ? new Date(jobs[0].runAt).toISOString()
      : null;

    return {
      hasSchedule: jobs.length > 0,
      cancelOnReply,
      steps,
      nextScheduledAt: steps[0]?.scheduledAt ?? firstJobRun,
      pendingJobCount: jobs.length,
      editableConfig:
        editableConfig ??
        this.resolveFollowUpEditableConfigFromJobs(jobs),
      retryAlternates,
    };
  }

  private buildEditableFollowUpConfigFromPendingJobs(
    jobs: Array<{
      cancelOnReply?: boolean;
      emailWait?: WorkflowDelayedJob['emailWait'];
      followUpCadenceSteps?: unknown[];
      engagementAlternateSteps?: unknown[];
    }>,
  ): {
    cancelOnReply: boolean;
    firstOutreachEngagement: FirstOutreachEngagementDto | null;
    steps: FollowUpSequenceStepDto[];
  } | null {
    if (!jobs.length) return null;

    const source =
      jobs.find(
        (j) =>
          Array.isArray(j.followUpCadenceSteps) && j.followUpCadenceSteps.length > 0,
      ) || jobs[0];
    const cancelOnReply = source.cancelOnReply !== false;
    const cadenceRaw = Array.isArray(source.followUpCadenceSteps)
      ? source.followUpCadenceSteps
      : [];

    const steps: FollowUpSequenceStepDto[] = cadenceRaw
      .map((raw) => raw as FollowUpSequenceStepDto)
      .map((s) => ({
        delayDays: Number(s.delayDays) || 0,
        delayHours: Number(s.delayHours) || 0,
        delayMinutes: Number(s.delayMinutes) || 0,
        ...(s.scheduledAt ? { scheduledAt: String(s.scheduledAt) } : {}),
        ...(s.inboxAccountId
          ? { inboxAccountId: String(s.inboxAccountId) }
          : {}),
        ...(s.email
          ? {
              email: {
                ...(s.email.sendMode ? { sendMode: s.email.sendMode } : {}),
                ...(s.email.templateId
                  ? { templateId: String(s.email.templateId) }
                  : {}),
                ...(s.email.subject ? { subject: String(s.email.subject) } : {}),
                ...(s.email.body ? { body: String(s.email.body) } : {}),
                ...(s.email.inboxAccountId
                  ? { inboxAccountId: String(s.email.inboxAccountId) }
                  : {}),
              },
            }
          : {}),
        ...(s.task?.title
          ? {
              task: {
                title: String(s.task.title),
                ...(s.task.body ? { body: String(s.task.body) } : {}),
                ...(s.task.dueInDays != null
                  ? { dueInDays: Number(s.task.dueInDays) || 0 }
                  : {}),
              },
            }
          : {}),
      }));

    const ew = source.emailWait;
    const altSource =
      (Array.isArray(ew?.alternateSteps) && ew.alternateSteps.length > 0
        ? ew.alternateSteps
        : null) ||
      (Array.isArray(source.engagementAlternateSteps) &&
      source.engagementAlternateSteps.length > 0
        ? source.engagementAlternateSteps
        : null);
    const firstOutreachEngagement =
      altSource && altSource.length > 0
        ? {
            firstWait: ew?.firstWaitMs
              ? (() => {
                  const p = msToDelayParts(Number(ew.firstWaitMs) || 0);
                  return {
                    waitDays: p.days,
                    waitHours: p.hours,
                    waitMinutes: p.minutes,
                  };
                })()
              : { waitDays: 2, waitHours: 0, waitMinutes: 0 },
            alternateSteps: (altSource as FollowUpNotOpenedResendDto[]).map(
              (s) => ({
                ...(s.waitDays != null ? { waitDays: Number(s.waitDays) || 0 } : {}),
                ...(s.waitHours != null
                  ? { waitHours: Number(s.waitHours) || 0 }
                  : {}),
                ...(s.waitMinutes != null
                  ? { waitMinutes: Number(s.waitMinutes) || 0 }
                  : {}),
                ...(s.deadlineAt ? { deadlineAt: String(s.deadlineAt) } : {}),
                ...(s.sendMode ? { sendMode: s.sendMode } : {}),
                ...(s.templateId ? { templateId: String(s.templateId) } : {}),
                ...(s.subject ? { subject: String(s.subject) } : {}),
                ...(s.body ? { body: String(s.body) } : {}),
                ...(s.aiInstructions
                  ? { aiInstructions: String(s.aiInstructions) }
                  : {}),
                ...(s.inboxAccountId
                  ? { inboxAccountId: String(s.inboxAccountId) }
                  : {}),
              }),
            ),
          }
        : null;

    if (!steps.length && !firstOutreachEngagement) {
      return null;
    }
    return { cancelOnReply, firstOutreachEngagement, steps };
  }

  /** Walk pending job steps and estimate email + task times (branch-mode sequences). */
  private projectScheduledStepsFromDelayedJob(
    job: {
      runAt: Date;
      stepsRemaining?: unknown[];
      pendingCanvasEmailAction?: Record<string, unknown>;
    },
    emailWait?: WorkflowDelayedJob['emailWait'],
  ): Array<{
    scheduledAt: string;
    kind: 'email' | 'task' | 'wait';
    label: string;
    templateId: string | null;
    taskDueInDays?: number;
  }> {
    const out: Array<{
      scheduledAt: string;
      kind: 'email' | 'task' | 'wait';
      label: string;
      templateId: string | null;
      taskDueInDays?: number;
    }> = [];
    let cursor = new Date(job.runAt).getTime();

    if (
      emailWait?.branchMode &&
      emailWait.deadlineAt &&
      !Array.isArray(emailWait.alternateSteps)
    ) {
      const deadline = new Date(emailWait.deadlineAt);
      out.push({
        scheduledAt: new Date(cursor).toISOString(),
        kind: 'wait',
        label: `Wait for open (deadline ${deadline.toLocaleString('en-US', { timeZone: process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })})`,
        templateId: null,
      });
      cursor = deadline.getTime();
    }

    const pushAction = (action: WorkflowAction | undefined) => {
      if (!action) return;
      const at = new Date(cursor).toISOString();
      if (action.type === 'send_email_template') {
        const custom =
          action.sendMode === 'custom' ||
          (!action.templateId && !!action.subject?.trim());
        out.push({
          scheduledAt: at,
          kind: 'email',
          label: custom
            ? String(action.subject || 'Custom email').trim().slice(0, 80)
            : 'Email',
          templateId:
            !custom && action.templateId ? String(action.templateId) : null,
        });
      } else if (action.type === 'create_task') {
        const title = String(action.title || 'Follow-up task').trim();
        out.push({
          scheduledAt: at,
          kind: 'task',
          label: title,
          templateId: null,
          taskDueInDays:
            action.dueInDays != null
              ? Math.max(0, Number(action.dueInDays) || 0)
              : 0,
        });
      }
    };

    const pending = job.pendingCanvasEmailAction as WorkflowAction | undefined;
    if (pending?.type === 'send_email_template') {
      pushAction(pending);
    }

    const raw = Array.isArray(job.stepsRemaining) ? job.stepsRemaining : [];
    for (const step of raw) {
      const s = step as {
        type?: string;
        action?: WorkflowAction;
        days?: number;
        hours?: number;
        minutes?: number;
      };
      if (s.type === 'delay') {
        cursor += delayMs(s);
        continue;
      }
      if (s.type === 'wait_email_open') {
        const waitStep = s as WorkflowWaitEmailOpenStep;
        const deadline = waitStep.deadlineAt
          ? new Date(waitStep.deadlineAt)
          : new Date(
              cursor +
                delayMs({
                  days: waitStep.waitDays,
                  hours: waitStep.waitHours,
                  minutes: waitStep.waitMinutes,
                }),
            );
        out.push({
          scheduledAt: new Date(cursor).toISOString(),
          kind: 'email',
          label: `First outreach: if not opened by ${deadline.toLocaleString('en-US', { timeZone: process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })} → alternate send`,
          templateId: null,
        });
        cursor = deadline.getTime();
        for (const ts of waitStep.onTimeoutSteps || []) {
          if (ts.type === 'action' && ts.action.type === 'send_email_template') {
            const custom =
              ts.action.sendMode === 'custom' ||
              (!ts.action.templateId && !!ts.action.subject?.trim());
            out.push({
              scheduledAt: new Date(cursor).toISOString(),
              kind: 'email',
              label: custom
                ? String(ts.action.subject || 'Alternate email').slice(0, 80)
                : 'Alternate email (not opened)',
              templateId: ts.action.templateId
                ? String(ts.action.templateId)
                : null,
            });
          }
        }
        continue;
      }
      if (s.type === 'action') {
        pushAction(s.action);
        continue;
      }
      pushAction(step as WorkflowAction);
    }

    return out;
  }

  /**
   * Enroll a lead/contact into an existing workflow (manual start).
   * Use workflows with delay + send_email_template steps for multi-touch cadences.
   */
  async enrollInWorkflow(
    workflowId: string,
    dto: {
      entityType: WorkflowEntityType;
      entityId: string;
      force?: boolean;
    },
    user: WorkflowDispatchEvent['user'],
  ): Promise<{ ok: boolean; message: string }> {
    if (!Types.ObjectId.isValid(workflowId)) {
      throw new BadRequestException('Invalid workflow id');
    }
    if (!Types.ObjectId.isValid(dto.entityId)) {
      throw new BadRequestException('Invalid entity id');
    }
    const wf = await this.workflowModel.findById(workflowId).exec();
    if (!wf || !wf.enabled) {
      throw new NotFoundException('Workflow not found or disabled');
    }
    const record = await this.fetchEntityRecord(
      dto.entityType,
      new Types.ObjectId(dto.entityId),
    );
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    if (dto.force) {
      await this.cancelPendingJobsForEntity(
        dto.entityType,
        dto.entityId,
        'Sequence restarted',
      );
      if (enrollmentOnce(wf as Workflow)) {
        await this.enrollmentModel
          .deleteOne({
            workflowId: wf._id,
            entityType: dto.entityType,
            entityId: new Types.ObjectId(dto.entityId),
          })
          .exec();
      }
    }

    const event: WorkflowDispatchEvent = {
      trigger: 'manual_enrollment',
      entityType: dto.entityType,
      entityId: new Types.ObjectId(dto.entityId),
      record,
      previous: null,
      user,
    };
    await this.runOne(wf as Workflow & { _id: Types.ObjectId }, event);
    return {
      ok: true,
      message: 'Workflow enrolled; scheduled steps will run when due.',
    };
  }

  /**
   * Quick follow-up sequence from lead/contact UI: template + delay per step.
   * Cancels any existing pending jobs for this record when starting.
   */
  private buildFollowUpWorkflowStepsFromDtos(
    steps: FollowUpSequenceStepDto[],
    scheduleCursorStart: number,
    resolveStepSendAccountId: (
      s: FollowUpSequenceStepDto,
    ) => string | undefined,
  ): WorkflowStep[] {
    const workflowSteps: WorkflowStep[] = [];
    let scheduleCursor = scheduleCursorStart;
    for (const s of steps) {
      const ms = resolveFollowUpStepDelayMs(s, scheduleCursor);
      if (s.scheduledAt) {
        const t = new Date(s.scheduledAt).getTime();
        if (Number.isFinite(t)) {
          scheduleCursor = t;
        }
      } else {
        scheduleCursor += ms;
      }
      if (ms > 0) {
        const parts = msToDelayParts(ms);
        workflowSteps.push({
          type: 'delay',
          days: parts.days,
          hours: parts.hours,
          minutes: parts.minutes,
        });
      }
      const emailId = s.email?.templateId || s.templateId;
      const customMode =
        s.email?.sendMode === 'custom' ||
        (!emailId && !!(s.email?.subject?.trim() || s.email?.body?.trim()));
      const stepAccountId = resolveStepSendAccountId(s);
      if (s.email?.sendMode === 'ai_draft') {
        workflowSteps.push({
          type: 'action',
          action: {
            type: 'send_email_template',
            sendMode: 'ai_draft',
            aiInstructions: s.email.aiInstructions?.trim() || undefined,
            ...(stepAccountId ? { inboxAccountId: stepAccountId } : {}),
          },
        });
      } else if (customMode && s.email?.subject?.trim() && s.email?.body?.trim()) {
        workflowSteps.push({
          type: 'action',
          action: {
            type: 'send_email_template',
            sendMode: 'custom',
            subject: String(s.email.subject).trim(),
            body: String(s.email.body),
            ...(stepAccountId ? { inboxAccountId: stepAccountId } : {}),
          },
        });
      } else if (emailId && Types.ObjectId.isValid(emailId)) {
        workflowSteps.push({
          type: 'action',
          action: {
            type: 'send_email_template',
            sendMode: 'template',
            templateId: emailId,
            ...(stepAccountId ? { inboxAccountId: stepAccountId } : {}),
          },
        });
      }
      if (s.task?.title?.trim()) {
        workflowSteps.push({
          type: 'action',
          action: {
            type: 'create_task',
            title: String(s.task.title).trim(),
            body: s.task.body?.trim() || undefined,
            dueInDays:
              s.task.dueInDays != null
                ? Math.max(0, Number(s.task.dueInDays) || 0)
                : 0,
          },
        });
      }
    }
    return workflowSteps;
  }

  private inboxAccountIdFromTracking(
    trk: { accountId?: Types.ObjectId | string } | null | undefined,
  ): string | undefined {
    if (!trk?.accountId) return undefined;
    const id = String(trk.accountId);
    return Types.ObjectId.isValid(id) ? id : undefined;
  }

  /** Mailbox that sent the tracked email (for follow-ups after an open). */
  private async resolveFollowUpSendAccountAfterEngagement(
    job: WorkflowDelayedJobDocument,
    openedTracking?: { accountId?: Types.ObjectId | string; fromEmail?: string } | null,
  ): Promise<{ accountId?: string; fromEmail?: string }> {
    const fromOpen = this.inboxAccountIdFromTracking(openedTracking ?? null);
    if (fromOpen) {
      return {
        accountId: fromOpen,
        fromEmail: openedTracking?.fromEmail?.trim() || undefined,
      };
    }
    const mod = this.entityTypeToModule(job.entityType);
    const latest =
      await this.emailTrackingService.getLatestOutboundIdentityForCrmRecord(
        String(job.entityId),
        mod,
        false,
      );
    if (latest?.accountId && Types.ObjectId.isValid(latest.accountId)) {
      return {
        accountId: latest.accountId,
        fromEmail: latest.fromEmail?.trim() || undefined,
      };
    }
    const locked = job.lockedInboxAccountId;
    if (locked && Types.ObjectId.isValid(String(locked))) {
      return { accountId: String(locked) };
    }
    return {};
  }

  private resolveFollowUpStepAccountFromJob(
    job: WorkflowDelayedJobDocument,
    s: FollowUpSequenceStepDto,
  ): string | undefined {
    const raw = (s.inboxAccountId || s.email?.inboxAccountId || '').trim();
    if (raw && Types.ObjectId.isValid(raw)) {
      return raw;
    }
    const locked = job.lockedInboxAccountId;
    return locked && Types.ObjectId.isValid(String(locked))
      ? String(locked)
      : undefined;
  }

  private buildFollowUpEmailAction(
    email: {
      sendMode?: 'template' | 'custom' | 'ai_draft';
      templateId?: string;
      subject?: string;
      body?: string;
      aiInstructions?: string;
    },
    inboxAccountId?: string,
  ): WorkflowAction | null {
    if (email.sendMode === 'ai_draft') {
      return {
        type: 'send_email_template',
        sendMode: 'ai_draft',
        aiInstructions: email.aiInstructions?.trim() || undefined,
        ...(inboxAccountId ? { inboxAccountId } : {}),
      };
    }
    const emailId = email.templateId;
    const customMode =
      email.sendMode === 'custom' ||
      (!emailId && !!(email.subject?.trim() || email.body?.trim()));
    if (customMode && email.subject?.trim() && email.body?.trim()) {
      return {
        type: 'send_email_template',
        sendMode: 'custom',
        subject: String(email.subject).trim(),
        body: String(email.body),
        ...(inboxAccountId ? { inboxAccountId } : {}),
      };
    }
    if (emailId && Types.ObjectId.isValid(emailId)) {
      return {
        type: 'send_email_template',
        sendMode: 'template',
        templateId: emailId,
        ...(inboxAccountId ? { inboxAccountId } : {}),
      };
    }
    return null;
  }

  async startFollowUpSequence(
    dto: {
      entityType: 'Lead' | 'Contact';
      entityId: string;
      inboxAccountId?: string;
      overrideMailbox?: boolean;
      cancelOnReply?: boolean;
      /** Explicit tracking token for the outreach email this sequence should watch. */
      trackingToken?: string;
      /** Wait on manual first outreach; if not opened, chained alternate emails before follow-ups. */
      firstOutreachEngagement?: FirstOutreachEngagementDto;
      /** @deprecated Use firstOutreachEngagement */
      firstOutreachIfNotOpened?: FollowUpNotOpenedResendDto;
      steps: FollowUpSequenceStepDto[];
    },
    user: WorkflowDispatchEvent['user'],
  ): Promise<{ ok: boolean; message: string; pendingJobs: number }> {
    if (!Types.ObjectId.isValid(dto.entityId)) {
      throw new BadRequestException('Invalid entity id');
    }
    const steps = dto.steps || [];
    const engagement = this.normalizeFirstOutreachEngagement(dto);
    if (!steps.length && !engagement) {
      throw new BadRequestException(
        'Add at least one follow-up step or configure open-tracking alternate steps',
      );
    }
    if (engagement) {
      const engagementToken =
        dto.trackingToken?.trim() ||
        (await this.emailTrackingService.findLatestTrackingTokenForEntity(
          dto.entityId,
          new Date(Date.now() - 90 * 24 * 3600 * 1000),
          false,
        ));
      if (!engagementToken) {
        throw new BadRequestException(
          'Send a tracked outreach email from CRM compose first, then schedule open-tracking alternates.',
        );
      }
      this.validateNotOpenedWaitOnly(
        engagement.firstWait ?? { waitDays: 2 },
        'Step 1 wait after first outreach',
      );
      engagement.alternateSteps.forEach((step, i) => {
        this.validateNotOpenedResendDto(step, `Alternate step ${i + 1}`);
        const altRaw = step.inboxAccountId?.trim();
        if (!altRaw || !Types.ObjectId.isValid(altRaw)) {
          throw new BadRequestException(
            `Alternate step ${i + 1}: pick a connected mailbox`,
          );
        }
      });
    }

    for (const s of steps) {
      const emailId = s.email?.templateId || s.templateId;
      const customMode =
        s.email?.sendMode === 'custom' ||
        (!emailId && !!(s.email?.subject?.trim() || s.email?.body?.trim()));
      const aiDraftMode = s.email?.sendMode === 'ai_draft';
      const hasTemplateEmail =
        !!emailId && Types.ObjectId.isValid(emailId) && !customMode && !aiDraftMode;
      const hasCustomEmail =
        customMode &&
        !!s.email?.subject?.trim() &&
        !!String(s.email?.body || '').replace(/<[^>]+>/g, '').trim();
      const hasEmail = hasTemplateEmail || hasCustomEmail || aiDraftMode;
      const hasTask = !!(s.task?.title && String(s.task.title).trim());
      if (!hasEmail && !hasTask) {
        throw new BadRequestException(
          'Each step needs a template or custom email (subject + body) and/or a follow-up task',
        );
      }
      if (hasTemplateEmail && emailId && !Types.ObjectId.isValid(emailId)) {
        throw new BadRequestException('Invalid email template id in sequence');
      }
      if (customMode && !hasCustomEmail) {
        throw new BadRequestException(
          'Custom email steps need a subject and message body',
        );
      }
      if (s.scheduledAt) {
        const t = new Date(s.scheduledAt).getTime();
        if (!Number.isFinite(t)) {
          throw new BadRequestException('Invalid scheduledAt on a sequence step');
        }
        if (t < Date.now() + 60_000) {
          throw new BadRequestException(
            'Each scheduled date & time must be at least 1 minute in the future',
          );
        }
      }
    }

    const record = await this.fetchEntityRecord(
      dto.entityType,
      new Types.ObjectId(dto.entityId),
    );
    if (!record) {
      throw new NotFoundException('Record not found');
    }

    await this.cancelPendingJobsForEntity(
      dto.entityType,
      dto.entityId,
      'New follow-up sequence started',
    );

    const mailboxHint = await this.getFollowUpMailboxHint(
      user,
      dto.entityType,
      dto.entityId,
    );
    const { accountId: defaultSendAccountId } = this.resolveFollowUpSendAccountId(
      mailboxHint,
      {
        inboxAccountId: dto.inboxAccountId,
        overrideMailbox: dto.overrideMailbox,
      },
    );

    const resolveStepSendAccountId = (
      s: FollowUpSequenceStepDto,
    ): string | undefined => {
      const raw = (s.inboxAccountId || s.email?.inboxAccountId || '').trim();
      if (raw && Types.ObjectId.isValid(raw)) {
        const stillConnected = mailboxHint.accounts.some((a) => a._id === raw);
        if (stillConnected) {
          return raw;
        }
      }
      return defaultSendAccountId;
    };

    const stepAccountIds = steps
      .map((s) => resolveStepSendAccountId(s))
      .filter((id): id is string => !!id && Types.ObjectId.isValid(id));

    const uniqueStepAccounts = [...new Set(stepAccountIds)];
    if (
      mailboxHint.priorOutboundFound &&
      uniqueStepAccounts.length > 0
    ) {
      for (const accountId of uniqueStepAccounts) {
        const stillConnected = mailboxHint.accounts.some(
          (a) => a._id === accountId,
        );
        if (!stillConnected) {
          throw new BadRequestException(
            'One or more selected mailboxes are not connected. Reconnect them or choose another sender.',
          );
        }
      }
      const hasPerStepOverride = steps.some((s) => {
        const raw = (s.inboxAccountId || s.email?.inboxAccountId || '').trim();
        return (
          !!raw &&
          Types.ObjectId.isValid(raw) &&
          raw !== mailboxHint.requiredAccountId
        );
      });
      if (
        mailboxHint.requiredAccountId &&
        !dto.overrideMailbox &&
        !hasPerStepOverride &&
        dto.inboxAccountId?.trim() &&
        dto.inboxAccountId.trim() !== mailboxHint.requiredAccountId
      ) {
        throw new BadRequestException(
          'Follow-ups must use the same mailbox as your last email to this contact, or pick a sender per step.',
        );
      }
    }

    const wfId = await this.getOrCreateSystemFollowUpWorkflowId();
    const wf = await this.workflowModel.findById(wfId).lean().exec();
    if (!wf) {
      throw new NotFoundException('System follow-up workflow missing');
    }

    const workflowSteps: WorkflowStep[] = [];
    const trackingSince = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    let outreachToken: string | null = null;
    let outreachAlreadyOpened = false;

    if (steps.length > 0) {
      outreachToken =
        dto.trackingToken?.trim() ||
        mailboxHint.latestTrackingToken ||
        (await this.emailTrackingService.findLatestTrackingTokenForEntity(
          dto.entityId,
          trackingSince,
          false,
        ));
      if (!outreachToken) {
        throw new BadRequestException(
          'Send a tracked outreach email from CRM compose first. Follow-ups start only after the lead opens a tracked send.',
        );
      }
      const trk = await this.emailTrackingService.findByToken(outreachToken);
      outreachAlreadyOpened = !!(
        trk?.lastOpenedAt || (Number(trk?.openCount) || 0) > 0
      );
    }

    if (engagement) {
      const fw = engagement.firstWait ?? { waitDays: 2 };
      for (let i = 0; i < engagement.alternateSteps.length; i++) {
        const altRaw = engagement.alternateSteps[i].inboxAccountId?.trim();
        if (
          mailboxHint.requiredAccountId &&
          altRaw === mailboxHint.requiredAccountId
        ) {
          throw new BadRequestException(
            `Alternate step ${i + 1} must use a different mailbox than your first outreach`,
          );
        }
      }
      workflowSteps.push({
        type: 'wait_email_open',
        waitDays: fw.waitDays,
        waitHours: fw.waitHours,
        waitMinutes: fw.waitMinutes,
        deadlineAt: fw.deadlineAt,
        onTimeoutSteps: [],
      });
    }

    const followUpCadenceSteps = this.buildFollowUpWorkflowStepsFromDtos(
      steps,
      Date.now(),
      resolveStepSendAccountId,
    );

    if (steps.length > 0) {
      const deferCadenceUntilOpen = !!engagement || !outreachAlreadyOpened;
      if (deferCadenceUntilOpen && !engagement) {
        workflowSteps.push({
          type: 'wait_email_open',
          waitDays: 14,
          waitHours: 0,
          waitMinutes: 0,
          onTimeoutSteps: [],
        });
      } else if (!engagement && outreachAlreadyOpened) {
        workflowSteps.push(...followUpCadenceSteps);
      }
    }

    const event: WorkflowDispatchEvent = {
      trigger: 'manual_enrollment',
      entityType: dto.entityType,
      entityId: new Types.ObjectId(dto.entityId),
      record,
      previous: null,
      user,
    };
    const ctx = this.initRunContext(
      wf as Workflow,
      undefined,
      dto.cancelOnReply !== false,
    );
    const boundOutreachToken =
      dto.trackingToken?.trim() ||
      outreachToken ||
      (engagement
        ? await this.emailTrackingService.findLatestTrackingTokenForEntity(
            dto.entityId,
            trackingSince,
            false,
          )
        : null);
    if (boundOutreachToken) {
      ctx.lastEmailTrackingToken = boundOutreachToken;
    }
    if (steps.length > 0) {
      ctx.cadenceStartsAfterOpen = true;
      ctx.followUpSequenceStepDtos = steps;
    }
    if (!ctx.lastEmailTrackingToken) {
      const latestOutreachToken = await this.resolveLatestManualOutreachToken(
        dto.entityId,
      );
      if (latestOutreachToken) {
        ctx.lastEmailTrackingToken = latestOutreachToken;
      }
    }
    if (engagement) {
      ctx.alternateEngagementSteps = engagement.alternateSteps;
      ctx.firstEngagementWait = engagement.firstWait ?? { waitDays: 2 };
      if (steps.length > 0) {
        ctx.cadenceStartsAfterOpen = true;
        ctx.followUpSequenceStepDtos = steps;
      }
    }
    if (
      !engagement &&
      stepAccountIds.length > 0 &&
      stepAccountIds.every((id) => id === stepAccountIds[0])
    ) {
      ctx.lockedInboxAccountId = stepAccountIds[0];
    }
    const results: string[] = [];
    const authorId = this.resolveAuthorId(event);
    const scheduled = await this.runStepList(
      wf as Workflow & { _id: Types.ObjectId },
      event,
      authorId,
      workflowSteps,
      results,
      'Follow-up sequence',
      ctx,
    );

    if (scheduled) {
      await this.logWorkflowScheduleToTimeline({
        workflowId: wfId,
        entityType: dto.entityType,
        entityId: event.entityId,
        trigger: 'manual_enrollment',
        branchLabel: 'Follow-up sequence',
        actionResults: results,
        event,
      });
    } else {
      await this.logExecution({
        workflowId: wfId,
        entityType: dto.entityType,
        entityId: event.entityId,
        trigger: 'manual_enrollment',
        status: 'success',
        actionResults: results,
        branchLabel: 'Follow-up sequence',
      });
    }

    const pending = await this.listPendingJobsForEntity(
      dto.entityType,
      dto.entityId,
    );
    if (
      !scheduled &&
      dto.entityType === 'Lead' &&
      Types.ObjectId.isValid(dto.entityId)
    ) {
      void this.leadEngagementAutomation.onLeadFollowUpSequenceComplete(
        dto.entityId,
      );
    }
    const hasEngagement = !!engagement;
    const hasFollowUps = steps.length > 0;
    let message: string;
    if (scheduled) {
      if (hasEngagement && hasFollowUps) {
        message = 'Open tracking and follow-ups scheduled.';
      } else if (hasEngagement) {
        message = 'Open tracking scheduled.';
      } else {
        message = 'Follow-up sequence scheduled.';
      }
    } else if (hasEngagement && !hasFollowUps) {
      message = 'Open tracking completed (no delays).';
    } else {
      message = 'Follow-up sequence completed (no delays).';
    }
    return {
      ok: true,
      message,
      pendingJobs: pending.length,
    };
  }

  /**
   * Re-queue alternate send when open deadline passed but alternates never fired
   * (e.g. job snapshot missing alternate steps). Requires an active pending wait job
   * or editable alternate config from a recent sequence on this record.
   */
  async retryMissedAlternateSends(
    dto: { entityType: 'Lead' | 'Contact'; entityId: string },
    user: WorkflowDispatchEvent['user'],
  ): Promise<{ ok: boolean; message: string }> {
    if (!Types.ObjectId.isValid(dto.entityId)) {
      throw new BadRequestException('Invalid entity id');
    }
    const { pendingJobs, recentTerminalJob } =
      await this.resolveFollowUpJobsForEntity(dto.entityType, dto.entityId);
    const configSourceJobs = pendingJobs.length
      ? pendingJobs
      : recentTerminalJob
        ? [recentTerminalJob]
        : [];
    const editableConfig =
      this.resolveFollowUpEditableConfigFromJobs(configSourceJobs);
    const altFromConfig =
      editableConfig?.firstOutreachEngagement?.alternateSteps || [];
    if (!altFromConfig.length) {
      throw new BadRequestException(
        'No alternate steps found for this record. Cancel and re-start the follow-up sequence with alternate mailboxes configured.',
      );
    }

    await this.requeueMissedAlternateSendForEntity(
      dto.entityType,
      dto.entityId,
      altFromConfig,
      user,
      'Manual retry — re-attempting alternate send',
    );

    void this.processDueDelayedJobs();
    return {
      ok: true,
      message:
        'Alternate send retry queued. Refresh the timeline in a minute — you should see an Email sent entry from the alternate mailbox.',
    };
  }

  private async requeueMissedAlternateSendForEntity(
    entityType: WorkflowEntityType,
    entityId: string,
    altFromConfig: FollowUpNotOpenedResendDto[],
    user: WorkflowDispatchEvent['user'] | undefined,
    retryNote: string,
  ): Promise<void> {
    const entityOid = new Types.ObjectId(entityId);
    const pending = await this.delayedJobModel
      .find({
        entityType,
        entityId: entityOid,
        status: 'pending',
        branchLabel: 'Follow-up sequence',
      })
      .sort({ runAt: 1 })
      .exec();

    let job: WorkflowDelayedJobDocument | null =
      pending.find((j) => !!j.emailWait) || pending[0] || null;
    if (!job) {
      const recent = await this.delayedJobModel
        .find({
          entityType,
          entityId: entityOid,
          branchLabel: 'Follow-up sequence',
          status: { $in: ['done', 'failed'] },
        })
        .sort({ updatedAt: -1 })
        .limit(1)
        .exec();
      const revived = recent[0];
      if (!revived) {
        throw new BadRequestException(
          'No follow-up sequence job found. Start a new follow-up sequence for this lead.',
        );
      }
      job = revived;
      await this.delayedJobModel
        .updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'pending',
              runAt: new Date(),
              engagementAlternateSteps: altFromConfig,
              userSnapshot: (user || job.userSnapshot) as Record<
                string,
                unknown
              >,
              accumulatedResults: [
                ...(job.accumulatedResults || []),
                retryNote.includes('Manual')
                  ? `${retryNote} after missed deadline`
                  : retryNote,
              ],
              emailWait: {
                trackingToken:
                  job.lastEmailTrackingToken ||
                  job.emailWait?.trackingToken ||
                  '__no_token__',
                deadlineAt: new Date(0),
                pollIntervalMs: 60_000,
                branchOnTimeoutSteps: [],
                branchMode: true,
                firstOutreachGate: true,
                alternateStepIndex: -1,
                alternateSteps: altFromConfig,
              },
            },
            $unset: { errorMessage: 1, cancelReason: 1 },
          },
        )
        .exec();
    } else {
      await this.delayedJobModel
        .updateOne(
          { _id: job._id },
          {
            $set: {
              runAt: new Date(),
              engagementAlternateSteps: altFromConfig,
              ...(job.emailWait
                ? {
                    emailWait: {
                      ...job.emailWait,
                      deadlineAt: new Date(0),
                      alternateSteps: altFromConfig,
                      firstOutreachGate: true,
                      alternateStepIndex: -1,
                    },
                  }
                : {
                    emailWait: {
                      trackingToken:
                        job.lastEmailTrackingToken || '__no_token__',
                      deadlineAt: new Date(0),
                      pollIntervalMs: 60_000,
                      branchOnTimeoutSteps: [],
                      branchMode: true,
                      firstOutreachGate: true,
                      alternateStepIndex: -1,
                      alternateSteps: altFromConfig,
                    },
                  }),
              accumulatedResults: [
                ...(job.accumulatedResults || []),
                retryNote,
              ],
            },
          },
        )
        .exec();
    }
  }

  /**
   * Cancel pending workflow delayed jobs when the recipient replies (inbox sync).
   * Only jobs with cancelOnReply !== false are stopped (follow-up sequences default on).
   */
  async cancelPendingJobsOnReply(
    module: string,
    entityId: string,
    reason = 'Recipient replied',
  ): Promise<number> {
    const entityType = this.moduleStringToEntityType(module);
    if (!entityType || !Types.ObjectId.isValid(entityId)) return 0;
    const id = new Types.ObjectId(entityId);
    const r = await this.delayedJobModel
      .updateMany(
        {
          entityType,
          entityId: id,
          status: 'pending',
          cancelOnReply: { $ne: false },
        },
        { $set: { status: 'cancelled', cancelReason: reason } },
      )
      .exec();
    const n = r.modifiedCount ?? 0;
    if (n > 0) {
      await this.logFollowUpCancelledToTimeline(
        entityType,
        id,
        reason,
        n,
      );
    }
    if (entityType === 'Lead') {
      void this.leadEngagementAutomation.onLeadEmailReply(entityId);
    }
    return n;
  }

  dispatch(event: WorkflowDispatchEvent): void {
    setImmediate(() => {
      this.processEvent(event)
        .then(() => this.evaluateGoalsForRecord(event))
        .catch((err) =>
          this.logger.error(
            `[Workflows] dispatch failed: ${err?.message || err}`,
            err?.stack,
          ),
        );
    });
  }

  /**
   * When a tracked outbound email gets its **first** open (openCount becomes 1), run workflows
   * whose trigger is e.g. `lead_tracked_email_opened` for that record.
   */
  onTrackedEmailFirstOpen(payload: {
    module: string;
    entityId: Types.ObjectId;
    senderUserId: Types.ObjectId;
  }): void {
    setImmediate(async () => {
      try {
        const entityType = this.moduleStringToEntityType(payload.module);
        if (entityType) {
          const updated = await this.delayedJobModel
            .updateMany(
              {
                entityType,
                entityId: payload.entityId,
                status: 'pending',
                emailWait: { $ne: null },
              },
              { $set: { runAt: new Date(0) } },
            )
            .exec();
          if (updated.modifiedCount > 0) {
            void this.processDueDelayedJobs().catch((err) =>
              this.logger.error(
                `[Workflows] Immediate processDueDelayedJobs failed: ${err?.message || err}`,
              ),
            );
          }
        }
      } catch (err: any) {
        this.logger.error(
          `[Workflows] failed to accelerate pending jobs on open: ${err?.message || err}`,
        );
      }

      void this.dispatchTrackedEmailOpenTrigger(payload).catch((err: unknown) =>
        this.logger.warn(
          `[Workflows] onTrackedEmailFirstOpen: ${err instanceof Error ? err.message : err}`,
        ),
      );
    });
  }

  /**
   * When a client replies to a tracked CRM thread (in_reply_to match), run workflows
   * whose trigger is e.g. `lead_tracked_email_replied` for that record.
   */
  onTrackedEmailReply(payload: {
    module: string;
    entityId: Types.ObjectId;
    senderUserId: Types.ObjectId;
  }): void {
    setImmediate(() => {
      void this.dispatchTrackedEmailReplyTrigger(payload).catch((err: unknown) =>
        this.logger.warn(
          `[Workflows] onTrackedEmailReply: ${err instanceof Error ? err.message : err}`,
        ),
      );
    });
  }

  private async dispatchTrackedEmailOpenTrigger(payload: {
    module: string;
    entityId: Types.ObjectId;
    senderUserId: Types.ObjectId;
  }): Promise<void> {
    const entityType = this.moduleStringToEntityType(payload.module);
    if (!entityType) return;
    const trigger = this.triggerForTrackedEmailOpened(entityType);
    if (!trigger) return;
    const record = await this.fetchEntityRecord(entityType, payload.entityId);
    if (!record) return;
    this.dispatch({
      trigger,
      entityType,
      entityId: payload.entityId,
      record,
      previous: null,
      user: { userId: String(payload.senderUserId) },
    });
  }

  private async dispatchTrackedEmailReplyTrigger(payload: {
    module: string;
    entityId: Types.ObjectId;
    senderUserId: Types.ObjectId;
  }): Promise<void> {
    const entityType = this.moduleStringToEntityType(payload.module);
    if (!entityType) return;
    const trigger = this.triggerForTrackedEmailReplied(entityType);
    if (!trigger) return;
    const record = await this.fetchEntityRecord(entityType, payload.entityId);
    if (!record) return;
    this.dispatch({
      trigger,
      entityType,
      entityId: payload.entityId,
      record,
      previous: null,
      user: { userId: String(payload.senderUserId) },
    });
  }

  private moduleStringToEntityType(
    module: string,
  ): WorkflowEntityType | null {
    const m = (module || '').toLowerCase();
    if (m === 'leads') return 'Lead';
    if (m === 'contacts') return 'Contact';
    if (m === 'organizations') return 'Organization';
    return null;
  }

  private triggerForTrackedEmailOpened(
    entityType: WorkflowEntityType,
  ): WorkflowTrigger | null {
    switch (entityType) {
      case 'Lead':
        return 'lead_tracked_email_opened';
      case 'Contact':
        return 'contact_tracked_email_opened';
      case 'Organization':
        return 'organization_tracked_email_opened';
      default:
        return null;
    }
  }

  private triggerForTrackedEmailReplied(
    entityType: WorkflowEntityType,
  ): WorkflowTrigger | null {
    switch (entityType) {
      case 'Lead':
        return 'lead_tracked_email_replied';
      case 'Contact':
        return 'contact_tracked_email_replied';
      case 'Organization':
        return 'organization_tracked_email_replied';
      default:
        return null;
    }
  }

  private initRunContext(
    wf: Workflow,
    job?: WorkflowDelayedJobDocument,
    cancelOnReplyOverride?: boolean,
  ): WorkflowRunContext {
    if (job) {
      const started =
        job.sequenceStartedAt != null
          ? new Date(job.sequenceStartedAt)
          : (job as { createdAt?: Date }).createdAt
            ? new Date((job as { createdAt?: Date }).createdAt!)
            : new Date();
      const cancelOnReply =
        cancelOnReplyOverride !== undefined
          ? cancelOnReplyOverride !== false
          : job.cancelOnReply !== undefined
            ? job.cancelOnReply !== false
            : wf.cancelOnReply !== false;
      const locked =
        job.lockedInboxAccountId != null
          ? String(job.lockedInboxAccountId)
          : undefined;
      const jobId =
        (job as { _id?: Types.ObjectId })._id != null
          ? String((job as { _id?: Types.ObjectId })._id)
          : undefined;
      const engagementAlts = this.resolveEngagementAlternateSteps(job);
      const cadenceSteps = Array.isArray(job.followUpCadenceSteps)
        ? (job.followUpCadenceSteps as FollowUpSequenceStepDto[])
        : undefined;
      return {
        lastEmailTrackingToken: job.lastEmailTrackingToken,
        sequenceStartedAt: started,
        cancelOnReply,
        ...(locked ? { lockedInboxAccountId: locked } : {}),
        ...(jobId ? { workflowDelayedJobId: jobId } : {}),
        ...(engagementAlts.length
          ? { alternateEngagementSteps: engagementAlts }
          : {}),
        ...(cadenceSteps?.length
          ? {
              followUpSequenceStepDtos: cadenceSteps,
              cadenceStartsAfterOpen: true,
            }
          : {}),
      };
    }
    return {
      sequenceStartedAt: new Date(),
      cancelOnReply:
        cancelOnReplyOverride !== undefined
          ? cancelOnReplyOverride !== false
          : wf.cancelOnReply !== false,
    };
  }

  private resolveNotOpenedWaitMs(dto: FollowUpNotOpenedResendDto): number {
    if (dto.deadlineAt) {
      const t = new Date(dto.deadlineAt).getTime();
      if (Number.isFinite(t)) {
        return Math.max(60_000, t - Date.now());
      }
    }
    return delayMs({
      days: dto.waitDays,
      hours: dto.waitHours,
      minutes: dto.waitMinutes,
    });
  }

  private normalizeFirstOutreachEngagement(dto: {
    firstOutreachEngagement?: FirstOutreachEngagementDto;
    firstOutreachIfNotOpened?: FollowUpNotOpenedResendDto;
  }): FirstOutreachEngagementDto | null {
    if (dto.firstOutreachEngagement?.alternateSteps?.length) {
      const e = dto.firstOutreachEngagement;
      return {
        firstWait: e.firstWait ?? { waitDays: 2 },
        alternateSteps: e.alternateSteps,
      };
    }
    const legacy = dto.firstOutreachIfNotOpened;
    if (!legacy) return null;
    const firstWait: FollowUpNotOpenedResendDto = {
      waitDays: legacy.waitDays,
      waitHours: legacy.waitHours,
      waitMinutes: legacy.waitMinutes,
      deadlineAt: legacy.deadlineAt,
    };
    return {
      firstWait,
      alternateSteps: [
        {
          waitDays: legacy.waitDays ?? 2,
          waitHours: legacy.waitHours,
          waitMinutes: legacy.waitMinutes,
          deadlineAt: legacy.deadlineAt,
          sendMode: legacy.sendMode,
          templateId: legacy.templateId,
          subject: legacy.subject,
          body: legacy.body,
          inboxAccountId: legacy.inboxAccountId,
        },
      ],
    };
  }

  /** Wait timing only (first outreach open gate — no email body on this step). */
  private validateNotOpenedWaitOnly(
    no: FollowUpNotOpenedResendDto,
    label: string,
  ): void {
    const waitMs = this.resolveNotOpenedWaitMs(no);
    if (waitMs < 60_000) {
      throw new BadRequestException(
        `${label} must be at least 1 minute in the future`,
      );
    }
  }

  private validateNotOpenedResendDto(
    no: FollowUpNotOpenedResendDto,
    label: string,
  ): void {
    if (no.sendMode === 'ai_draft') {
      this.validateNotOpenedWaitOnly(no, label);
      return;
    }
    const noCustom =
      no.sendMode === 'custom' ||
      (!no.templateId && !!(no.subject?.trim() || no.body?.trim()));
    const hasNoTemplate =
      !!no.templateId && Types.ObjectId.isValid(no.templateId) && !noCustom;
    const hasNoCustom =
      noCustom &&
      !!no.subject?.trim() &&
      !!String(no.body || '').replace(/<[^>]+>/g, '').trim();
    if (!hasNoTemplate && !hasNoCustom) {
      throw new BadRequestException(
        `${label} needs a subject and body or a template`,
      );
    }
    this.validateNotOpenedWaitOnly(no, label);
  }

  /**
   * Resolve which mailbox follow-ups should use (last outbound to this record/recipient).
   */
  async getFollowUpMailboxHint(
    user: WorkflowDispatchEvent['user'],
    entityType: 'Lead' | 'Contact',
    entityId: string,
  ): Promise<{
    priorOutboundFound: boolean;
    hasTrackedOutreach: boolean;
    /** True when any tracked send to this record has been opened. */
    anyOpened: boolean;
    /** True when the latest tracked outreach (latestTrackingToken) has been opened. */
    latestOutreachOpened: boolean;
    latestTrackingToken: string | null;
    requiredAccountId: string | null;
    requiredFromEmail: string | null;
    recipientEmail: string | null;
    accounts: Array<{ _id: string; email: string; displayName?: string }>;
  }> {
    const userId = this.resolveWorkflowUserId({
      trigger: 'manual_enrollment',
      entityType,
      entityId: new Types.ObjectId(entityId),
      record: {},
      user,
    });
    const record = await this.fetchEntityRecord(
      entityType,
      new Types.ObjectId(entityId),
    );
    const recipientEmail = record
      ? await this.resolveWorkflowRecipientEmail(
          entityType,
          new Types.ObjectId(entityId),
          record,
        )
      : null;

    let requiredAccountId: string | null = null;
    let requiredFromEmail: string | null = null;

    const mod = this.entityTypeToModule(entityType);
    const byEntity =
      await this.emailTrackingService.getLatestOutboundIdentityForCrmRecord(
        entityId,
        mod,
        false,
      );
    if (byEntity?.accountId) {
      requiredAccountId = byEntity.accountId;
      requiredFromEmail = byEntity.fromEmail;
    } else if (userId && recipientEmail) {
      const byRecipient =
        await this.inboxAccountsService.getSuggestedSendFromForRecipient(
          userId,
          recipientEmail,
        );
      requiredAccountId = byRecipient.accountId;
      requiredFromEmail = byRecipient.fromEmail;
    }

    const priorOutboundFound = !!(
      requiredAccountId && Types.ObjectId.isValid(requiredAccountId)
    );

    let accounts: Array<{ _id: string; email: string; displayName?: string }> =
      [];
    if (userId) {
      const list = await this.inboxAccountsService.listAccountsForUser(
        userId,
        user?.email,
      );
      accounts = (Array.isArray(list) ? list : [])
        .filter((a) => (a as { isActive?: boolean }).isActive !== false)
        .map((a) => {
          const row = a as { _id?: unknown; email?: string; displayName?: string };
          return {
            _id: String(row._id),
            email: String(row.email || ''),
            displayName: row.displayName,
          };
        });
    }

    if (requiredAccountId && requiredFromEmail) {
      const exists = accounts.some((a) => a._id === requiredAccountId);
      if (!exists) {
        const match = accounts.find(
          (a) => a.email.toLowerCase() === requiredFromEmail!.toLowerCase(),
        );
        if (match) {
          requiredAccountId = match._id;
        }
      }
    }

    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const latestTrackingToken =
      await this.emailTrackingService.findLatestTrackingTokenForEntity(
        entityId,
        since,
        false,
      );

    const engagement =
      await this.emailTrackingService.summarizeEngagementForCrmRecord(
        entityId,
        mod,
      );
    let latestOutreachOpened = false;
    if (latestTrackingToken) {
      const latestTrk =
        await this.emailTrackingService.findByToken(latestTrackingToken);
      latestOutreachOpened = !!(
        latestTrk?.lastOpenedAt || (Number(latestTrk?.openCount) || 0) > 0
      );
    }

    return {
      priorOutboundFound,
      hasTrackedOutreach: !!latestTrackingToken,
      anyOpened: engagement.anyOpened,
      latestOutreachOpened,
      latestTrackingToken,
      requiredAccountId,
      requiredFromEmail,
      recipientEmail,
      accounts,
    };
  }

  private resolveFollowUpSendAccountId(
    hint: {
      priorOutboundFound: boolean;
      requiredAccountId: string | null;
    },
    dto: {
      inboxAccountId?: string;
      overrideMailbox?: boolean;
    },
  ): { accountId: string | undefined; locked: boolean } {
    const chosen = dto.inboxAccountId?.trim();
    const required = hint.requiredAccountId?.trim();

    if (!hint.priorOutboundFound) {
      return {
        accountId:
          chosen && Types.ObjectId.isValid(chosen) ? chosen : undefined,
        locked: !!(chosen && Types.ObjectId.isValid(chosen)),
      };
    }

    if (!required || !Types.ObjectId.isValid(required)) {
      return { accountId: undefined, locked: false };
    }

    if (dto.overrideMailbox === true) {
      if (!chosen || !Types.ObjectId.isValid(chosen)) {
        return { accountId: undefined, locked: false };
      }
      return { accountId: chosen, locked: false };
    }

    if (chosen && chosen !== required) {
      throw new BadRequestException(
        'Follow-ups must use the same mailbox as your last email to this contact. Enable "Use a different mailbox" to override.',
      );
    }

    return { accountId: required, locked: true };
  }

  /** Write a durable delayed-job row (absolute `runAt` — not recalculated on restart). */
  private async claimOnceEnrollment(
    workflowId: Types.ObjectId,
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
  ): Promise<boolean> {
    try {
      await this.enrollmentModel.create({
        workflowId,
        entityType,
        entityId,
      });
      return true;
    } catch (e: any) {
      if (e?.code === 11000) return false;
      throw e;
    }
  }

  private async persistPendingDelayedJob(
    doc: {
      workflowId: Types.ObjectId;
      entityType: WorkflowEntityType;
      entityId: Types.ObjectId;
      trigger: WorkflowTrigger;
      stepsRemaining: unknown[];
      userSnapshot?: Record<string, unknown>;
      accumulatedResults: string[];
      branchLabel?: string;
      runAt: Date;
      executionMode: 'branch' | 'canvas';
      ctx: WorkflowRunContext;
      canvasNextNodeId?: string;
      canvasGraphSnapshot?: { nodes: unknown[]; edges: unknown[] };
      pendingCanvasEmailAction?: Record<string, unknown>;
      abVariant?: 'A' | 'B';
      emailWait?: WorkflowDelayedJob['emailWait'];
      lastEmailTrackingToken?: string;
      followUpCadenceSteps?: unknown[];
      engagementAlternateSteps?: unknown[];
      claimOnceEnrollment?: boolean;
    },
  ): Promise<boolean> {
    if (doc.claimOnceEnrollment) {
      const claimed = await this.claimOnceEnrollment(
        doc.workflowId,
        doc.entityType,
        doc.entityId,
      );
      if (!claimed) return false;
    }
    await this.delayedJobModel.create({
      workflowId: doc.workflowId,
      entityType: doc.entityType,
      entityId: doc.entityId,
      trigger: doc.trigger,
      stepsRemaining: doc.stepsRemaining,
      userSnapshot: doc.userSnapshot,
      accumulatedResults: doc.accumulatedResults,
      branchLabel: doc.branchLabel,
      runAt: doc.runAt,
      status: 'pending',
      executionMode: doc.executionMode,
      ...this.sequenceJobFields(doc.ctx),
      ...(doc.canvasNextNodeId ? { canvasNextNodeId: doc.canvasNextNodeId } : {}),
      ...(doc.canvasGraphSnapshot
        ? { canvasGraphSnapshot: doc.canvasGraphSnapshot }
        : {}),
      ...(doc.pendingCanvasEmailAction
        ? { pendingCanvasEmailAction: doc.pendingCanvasEmailAction }
        : {}),
      ...(doc.abVariant ? { abVariant: doc.abVariant } : {}),
      ...(doc.emailWait ? { emailWait: doc.emailWait } : {}),
      ...((doc.lastEmailTrackingToken || doc.ctx?.lastEmailTrackingToken)
        ? { lastEmailTrackingToken: doc.lastEmailTrackingToken || doc.ctx.lastEmailTrackingToken }
        : {}),
      ...((doc.followUpCadenceSteps?.length || doc.ctx?.followUpSequenceStepDtos?.length)
        ? { followUpCadenceSteps: doc.followUpCadenceSteps || doc.ctx.followUpSequenceStepDtos }
        : {}),
      ...(() => {
        const fromDoc = doc.engagementAlternateSteps || doc.ctx?.alternateEngagementSteps;
        const fromWait = doc.emailWait?.alternateSteps;
        const alternateSnap =
          Array.isArray(fromDoc) && fromDoc.length > 0
            ? fromDoc
            : Array.isArray(fromWait) && fromWait.length > 0
              ? fromWait
              : undefined;
        return alternateSnap?.length
          ? { engagementAlternateSteps: alternateSnap }
          : {};
      })(),
    });
    return true;
  }

  /** Resolve alternate engagement steps from emailWait and/or job snapshot. */
  private resolveEngagementAlternateSteps(
    job: {
      emailWait?: WorkflowDelayedJob['emailWait'];
      engagementAlternateSteps?: unknown[];
    },
  ): FollowUpNotOpenedResendDto[] {
    const fromWait = job.emailWait?.alternateSteps;
    if (Array.isArray(fromWait) && fromWait.length > 0) {
      return fromWait as FollowUpNotOpenedResendDto[];
    }
    const snap = job.engagementAlternateSteps;
    if (Array.isArray(snap) && snap.length > 0) {
      return snap as FollowUpNotOpenedResendDto[];
    }
    return [];
  }

  private accumulatedResultsExpectAlternates(results: string[] | undefined): boolean {
    return (results || []).some((r) =>
      /alternate (email|send|step)|else alternate|alternates or follow-ups/i.test(
        String(r),
      ),
    );
  }

  private countAutomaticRecoveryAttempts(
    results: string[] | undefined,
  ): number {
    return (results || []).filter((r) =>
      String(r).includes(FOLLOW_UP_AUTO_RECOVERY_NOTE),
    ).length;
  }

  private isPermanentFollowUpSendError(message: string | undefined): boolean {
    if (!message?.trim()) return false;
    const m = message.toLowerCase();
    return (
      /account not found/.test(m) ||
      /no connected mailbox/.test(m) ||
      /template not found/.test(m) ||
      /invalid template/.test(m) ||
      /no recipient email/.test(m) ||
      /no workflow user/.test(m) ||
      /record no longer exists/.test(m) ||
      /could not resolve a lead\/contact/.test(m) ||
      /custom email step is missing/.test(m)
    );
  }

  private terminalJobPermanentSendFailure(
    jobs: Array<
      Pick<WorkflowDelayedJob, 'errorMessage' | 'accumulatedResults'>
    >,
  ): string | null {
    for (const job of jobs) {
      if (this.isPermanentFollowUpSendError(job.errorMessage)) {
        return job.errorMessage!;
      }
      for (const r of job.accumulatedResults || []) {
        const line = String(r);
        const stepFail = line.match(/failed:\s*(.+)$/i);
        const candidate = stepFail?.[1]?.trim() || line;
        if (this.isPermanentFollowUpSendError(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private async findMissingAlternateMailboxIds(
    altSteps: FollowUpNotOpenedResendDto[],
  ): Promise<string[]> {
    const ids = altSteps
      .map((step) => step.inboxAccountId?.trim())
      .filter((id): id is string => !!id);
    const invalid = ids.filter((id) => !Types.ObjectId.isValid(id));
    if (invalid.length > 0 || ids.length < altSteps.length) {
      return [...invalid, ...(ids.length < altSteps.length ? ['(unset)'] : [])];
    }
    const existing = await this.inboxAccountsService.filterExistingAccountIds(
      ids,
    );
    return ids.filter((id) => !existing.has(id));
  }

  private async blockAutoRecoveryForJob(
    jobId: Types.ObjectId | string | undefined,
    reason?: string,
  ): Promise<void> {
    if (!jobId) return;
    await this.delayedJobModel
      .updateOne(
        { _id: jobId, autoRecoveryBlockedAt: { $exists: false } },
        { $set: { autoRecoveryBlockedAt: new Date() } },
      )
      .exec();
    if (reason) {
      this.logger.debug(
        `[Workflows] auto-recovery blocked for job ${String(jobId)}: ${reason}`,
      );
    }
  }

  /** Reload job + sibling rows so alternates survive partial emailWait clears. */
  private async resolveEngagementAlternateStepsForJob(
    job: WorkflowDelayedJobDocument,
  ): Promise<FollowUpNotOpenedResendDto[]> {
    const direct = this.resolveEngagementAlternateSteps(job);
    if (direct.length > 0) return direct;

    const fresh = await this.delayedJobModel.findById(job._id).lean().exec();
    if (fresh) {
      const fromFresh = this.resolveEngagementAlternateSteps(
        fresh as WorkflowDelayedJobDocument,
      );
      if (fromFresh.length > 0) return fromFresh;
    }

    const siblings = await this.delayedJobModel
      .find({
        entityType: job.entityType,
        entityId: job.entityId,
        branchLabel: job.branchLabel || 'Follow-up sequence',
        status: { $in: ['pending', 'processing', 'done', 'failed'] },
      })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean()
      .exec();
    for (const s of siblings) {
      const alt = this.resolveEngagementAlternateSteps(
        s as WorkflowDelayedJobDocument,
      );
      if (alt.length > 0) {
        if (fresh?._id) {
          void this.delayedJobModel
            .updateOne(
              { _id: fresh._id },
              { $set: { engagementAlternateSteps: alt } },
            )
            .exec();
        }
        return alt;
      }
    }
    return [];
  }

  /**
   * Recover alternate steps from job snapshot, siblings, or editable config — then persist
   * so the deadline handler can send without manual retry.
   */
  private async recoverAndPersistAlternateStepsForJob(
    job: WorkflowDelayedJobDocument,
  ): Promise<FollowUpNotOpenedResendDto[]> {
    const direct = await this.resolveEngagementAlternateStepsForJob(job);
    if (direct.length > 0) return direct;

    const siblings = await this.delayedJobModel
      .find({
        entityType: job.entityType,
        entityId: job.entityId,
        branchLabel: job.branchLabel || 'Follow-up sequence',
        status: { $in: ['pending', 'processing', 'done', 'failed'] },
      })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean()
      .exec();
    const config = this.resolveFollowUpEditableConfigFromJobs(
      siblings as Array<{
        cancelOnReply?: boolean;
        emailWait?: WorkflowDelayedJob['emailWait'];
        followUpCadenceSteps?: unknown[];
        engagementAlternateSteps?: unknown[];
      }>,
    );
    const recovered = config?.firstOutreachEngagement?.alternateSteps ?? [];
    if (!recovered.length) return [];

    await this.delayedJobModel
      .updateOne(
        { _id: job._id },
        {
          $set: {
            engagementAlternateSteps: recovered,
            ...(job.emailWait
              ? {
                  emailWait: {
                    ...job.emailWait,
                    alternateSteps: recovered,
                    firstOutreachGate: true,
                  },
                }
              : {}),
          },
        },
      )
      .exec();
    return recovered;
  }

  private async logMissingAlternateStepsFailure(
    wf: Workflow & { _id: Types.ObjectId },
    job: WorkflowDelayedJobDocument,
    results: string[],
    trigger: WorkflowTrigger,
  ): Promise<void> {
    results.push(
      'Alternate emails were not queued on this scheduled job (likely started before a fix, or the job snapshot was cleared). Cancel the sequence and start it again to send alternates.',
    );
    await this.logExecution({
      workflowId: wf._id,
      entityType: job.entityType,
      entityId: job.entityId,
      trigger,
      status: 'failed',
      actionResults: results,
      errorMessage:
        'Open-tracking alternate steps missing on delayed job — re-start follow-up sequence',
      branchLabel: job.branchLabel,
      hadScheduledDelay: true,
    });
  }

  /** Latest tracked manual outreach token for this CRM record (90-day lookback). */
  private async resolveLatestManualOutreachToken(
    entityId: string,
  ): Promise<string | undefined> {
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const token =
      await this.emailTrackingService.findLatestTrackingTokenForEntity(
        entityId,
        since,
      );
    return token || undefined;
  }

  private sequenceJobFields(ctx: WorkflowRunContext): {
    sequenceStartedAt?: Date;
    cancelOnReply: boolean;
    lockedInboxAccountId?: Types.ObjectId;
  } {
    const locked =
      ctx.lockedInboxAccountId &&
      Types.ObjectId.isValid(ctx.lockedInboxAccountId)
        ? new Types.ObjectId(ctx.lockedInboxAccountId)
        : undefined;
    return {
      ...(ctx.sequenceStartedAt
        ? { sequenceStartedAt: ctx.sequenceStartedAt }
        : {}),
      cancelOnReply: ctx.cancelOnReply !== false,
      ...(locked ? { lockedInboxAccountId: locked } : {}),
    };
  }

  private async getOrCreateSystemFollowUpWorkflowId(): Promise<Types.ObjectId> {
    const doc = await this.workflowModel
      .findOneAndUpdate(
        { name: SYSTEM_FOLLOW_UP_WORKFLOW_NAME },
        {
          $setOnInsert: {
            name: SYSTEM_FOLLOW_UP_WORKFLOW_NAME,
            description:
              'Internal workflow for scheduled follow-up sequences started from lead/contact pages.',
            enabled: true,
            trigger: 'manual_enrollment',
            editorMode: 'branches',
            branches: [],
            enrollmentPolicy: 'every_time',
          },
          $set: { cancelOnReply: true },
        },
        { upsert: true, new: true },
      )
      .exec();
    return doc!._id as Types.ObjectId;
  }

  async cancelPendingJobsForEntity(
    entityType: WorkflowEntityType,
    entityId: string | Types.ObjectId,
    reason: string,
  ): Promise<number> {
    const id = new Types.ObjectId(String(entityId));
    const r = await this.delayedJobModel
      .updateMany(
        { entityType, entityId: id, status: 'pending' },
        { $set: { status: 'cancelled', cancelReason: reason } },
      )
      .exec();
    const count = r.modifiedCount ?? 0;
    if (count > 0) {
      await this.logFollowUpCancelledToTimeline(
        entityType,
        id,
        reason,
        count,
      );
    }
    return count;
  }

  private async hasInboundReplySince(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
    since: Date,
  ): Promise<boolean> {
    // Activities store relatedTo as ObjectId; also treat any inbound from the
    // matched CRM email (sender_email) as a reply for cancel-on-reply.
    const hit = await this.activityModel
      .findOne({
        type: 'Email',
        'metadata.direction': 'inbound',
        'metadata.matchReason': { $in: ['in_reply_to', 'sender_email'] },
        createdAt: { $gte: since },
        $or: [
          { relatedTo: entityId, relatedType: entityType },
          {
            involvedEntities: {
              $elemMatch: { id: entityId, type: entityType },
            },
          },
        ],
      })
      .select('_id')
      .lean()
      .exec();
    return !!hit;
  }

  private async shouldCancelDueToReplyForEvent(
    wf: Workflow | null,
    ctx: WorkflowRunContext,
    event: WorkflowDispatchEvent,
  ): Promise<boolean> {
    if (ctx.cancelOnReply === false) return false;
    if (wf && wf.cancelOnReply === false) return false;
    const since = ctx.sequenceStartedAt || new Date(0);
    return this.hasInboundReplySince(
      event.entityType,
      event.entityId,
      since,
    );
  }

  /**
   * Claim and run due jobs. Scheduled via `onModuleInit` (default every 60s).
   * Tune with WORKFLOW_CRON, WORKFLOW_JOBS_PER_TICK. Uses atomic findOneAndUpdate+sort (no extra find scan).
   * Coalesces overlapping triggers (cron + API nudges) into one in-flight batch.
   */
  async processDueDelayedJobs(): Promise<void> {
    if (this.processingDueJobs) {
      this.processDueJobsQueued = true;
      return;
    }
    this.processingDueJobs = true;
    try {
      do {
        this.processDueJobsQueued = false;
        await this.runDueDelayedJobsBatch();
      } while (this.processDueJobsQueued);
    } finally {
      this.processingDueJobs = false;
    }
  }

  private async runDueDelayedJobsBatch(): Promise<void> {
    try {
      if (!(await this.isWorkflowSchedulerEnabled())) return;
      const now = new Date();
      const hasDue = await this.delayedJobModel.exists({
        status: 'pending',
        runAt: { $lte: now },
      });
      if (!hasDue) return;

      const needsDeadlineBump = await this.delayedJobModel.exists({
        status: 'pending',
        'emailWait.deadlineAt': { $lte: now },
        runAt: { $gt: now },
      });
      if (needsDeadlineBump) {
        await this.delayedJobModel
          .updateMany(
            {
              status: 'pending',
              'emailWait.deadlineAt': { $lte: now },
              runAt: { $gt: now },
            },
            { $set: { runAt: now } },
          )
          .exec();
      }

      const limit = this.getJobsPerTick();
      for (let i = 0; i < limit; i++) {
        const claimed = await this.delayedJobModel
          .findOneAndUpdate(
            { status: 'pending', runAt: { $lte: now } },
            { $set: { status: 'processing' } },
            { new: true, sort: { runAt: 1 }, lean: true },
          )
          .exec();
        if (!claimed) break;

        const jobId = claimed._id;
        try {
          const outcome = await this.resumeDelayedJob(
            claimed as WorkflowDelayedJobDocument,
          );
          if (outcome === 'rescheduled') {
            await this.delayedJobModel
              .updateOne(
                { _id: jobId, status: 'processing' },
                { $set: { status: 'pending' } },
              )
              .exec();
          } else if (outcome !== 'cancelled') {
            await this.delayedJobModel
              .updateOne({ _id: jobId }, { $set: { status: 'done' } })
              .exec();
          }
        } catch (e: any) {
          this.logger.error(
            `[Workflows] delayed job ${String(jobId)}: ${e?.message || e}`,
          );
          const failedMessage = e?.message || String(e);
          const repliedCancel =
            /recipient replied/i.test(failedMessage) ||
            /Cancelled: recipient replied/i.test(failedMessage);
          if (repliedCancel) {
            await this.delayedJobModel
              .updateOne(
                { _id: jobId },
                {
                  $set: {
                    status: 'cancelled',
                    cancelReason: 'Recipient replied before scheduled send',
                  },
                },
              )
              .exec();
            try {
              await this.logExecution({
                workflowId: claimed.workflowId as Types.ObjectId,
                entityType: claimed.entityType as WorkflowEntityType,
                entityId: claimed.entityId as Types.ObjectId,
                trigger: claimed.trigger as WorkflowTrigger,
                status: 'skipped',
                skipReason: 'Recipient replied — follow-up cancelled',
                actionResults: (claimed.accumulatedResults || []) as string[],
                branchLabel: claimed.branchLabel,
                hadScheduledDelay: true,
              });
            } catch (timelineErr) {
              this.logger.warn(
                `[Workflows] failed to write reply-cancel timeline for ${String(jobId)}: ${
                  timelineErr instanceof Error
                    ? timelineErr.message
                    : String(timelineErr)
                }`,
              );
            }
            continue;
          }
          const blockAutoRecovery =
            claimed.branchLabel === 'Follow-up sequence' &&
            (this.isPermanentFollowUpSendError(failedMessage) ||
              this.countAutomaticRecoveryAttempts(
                claimed.accumulatedResults as string[] | undefined,
              ) >= MAX_FOLLOW_UP_AUTO_RECOVERY_ATTEMPTS);
          await this.delayedJobModel
            .updateOne(
              { _id: jobId },
              {
                $set: {
                  status: 'failed',
                  errorMessage: failedMessage,
                  ...(blockAutoRecovery
                    ? { autoRecoveryBlockedAt: new Date() }
                    : {}),
                },
              },
            )
            .exec();
          try {
            await this.logExecution({
              workflowId: claimed.workflowId as Types.ObjectId,
              entityType: claimed.entityType as WorkflowEntityType,
              entityId: claimed.entityId as Types.ObjectId,
              trigger: claimed.trigger as WorkflowTrigger,
              status: 'failed',
              actionResults: (claimed.accumulatedResults as string[]) || [],
              errorMessage: failedMessage,
              branchLabel: claimed.branchLabel,
              hadScheduledDelay: true,
            });
          } catch (timelineErr) {
            this.logger.warn(
              `[Workflows] failed to write delayed-job failure timeline for ${String(jobId)}: ${
                timelineErr instanceof Error ? timelineErr.message : String(timelineErr)
              }`,
            );
          }
        }
      }
    } catch (e: unknown) {
      this.logger.error(
        `[Workflows] processDueDelayedJobs failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /**
   * Stale `processing` reclaim + missed alternate-send recovery (single tick, default every 10m).
   * Tune with WORKFLOW_MAINTENANCE_CRON.
   */
  async runWorkflowMaintenanceTasks(): Promise<void> {
    if (this.runningMaintenance) return;
    this.runningMaintenance = true;
    try {
      if (!(await this.isWorkflowSchedulerEnabled())) return;
      await this.recoverStaleWorkflowProcessingJobs();
      await this.recoverOpenedAndMisboundEmailWaitJobs();
      await this.recoverMissedFollowUpAlternateSends();
    } catch (e: unknown) {
      this.logger.error(
        `[Workflows] maintenance failed: ${e instanceof Error ? e.message : e}`,
      );
    } finally {
      this.runningMaintenance = false;
    }
  }

  /**
   * If the API dies after claiming a job, rows can stay `processing` forever. Reset stale ones to `pending`.
   * Default 30 min — long enough that normal workflow steps are not interrupted.
   */
  private async recoverStaleWorkflowProcessingJobs(): Promise<void> {
    const minutes = this.getStaleProcessingMinutes();
    const threshold = new Date(Date.now() - minutes * 60 * 1000);
    const hasStale = await this.delayedJobModel.exists({
      status: 'processing',
      updatedAt: { $lt: threshold },
    });
    if (!hasStale) return;

    const r = await this.delayedJobModel
      .updateMany(
        { status: 'processing', updatedAt: { $lt: threshold } },
        { $set: { status: 'pending' } },
      )
      .exec();
    if (r.modifiedCount > 0) {
      this.logger.warn(
        `[Workflows] reset ${r.modifiedCount} stale processing delayed job(s) to pending (>${minutes}m)`,
      );
      this.nudgeDueDelayedJobsIfIdle();
    }
  }

  /**
   * Self-heal pending open-wait jobs: nudge when the bound send is already opened,
   * or rebind to a newer tracked outreach when an old wrong token was stored.
   */
  private async recoverOpenedAndMisboundEmailWaitJobs(): Promise<void> {
    const jobs = await this.delayedJobModel
      .find({
        status: 'pending',
        emailWait: { $exists: true },
        'emailWait.trackingToken': { $exists: true, $nin: ['', '__no_token__'] },
      })
      .select(
        'entityId sequenceStartedAt createdAt emailWait lastEmailTrackingToken accumulatedResults',
      )
      .sort({ runAt: 1 })
      .limit(40)
      .lean()
      .exec();
    if (!jobs.length) return;

    const sinceDefault = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    let nudged = 0;
    let rebound = 0;

    for (const row of jobs) {
      const ew = row.emailWait as WorkflowDelayedJob['emailWait'];
      const bound = String(ew?.trackingToken || '').trim();
      if (!bound || bound === '__no_token__') continue;

      const boundTrk = await this.emailTrackingService.findByToken(bound);
      const boundOpened = !!(
        boundTrk?.lastOpenedAt || (Number(boundTrk?.openCount) || 0) > 0
      );
      if (boundOpened) {
        const res = await this.delayedJobModel
          .updateOne(
            { _id: row._id, status: 'pending' },
            { $set: { runAt: new Date() } },
          )
          .exec();
        if (res.modifiedCount) nudged++;
        continue;
      }

      const since =
        row.sequenceStartedAt != null
          ? new Date(row.sequenceStartedAt)
          : (row as { createdAt?: Date }).createdAt
            ? new Date((row as { createdAt?: Date }).createdAt!)
            : sinceDefault;
      const latest =
        await this.emailTrackingService.findLatestTrackingTokenForEntity(
          String(row.entityId),
          since,
          false,
        );
      if (!latest || latest === bound) continue;

      const latestTrk = await this.emailTrackingService.findByToken(latest);
      if (!latestTrk) continue;
      const boundCreated = boundTrk?._id?.getTimestamp?.()?.getTime() ?? 0;
      const latestCreated = latestTrk._id.getTimestamp().getTime();
      if (!latestCreated || latestCreated <= boundCreated) continue;

      const latestOpened = !!(
        latestTrk.lastOpenedAt || (Number(latestTrk.openCount) || 0) > 0
      );
      const note =
        'Recovered open wait — rebound to latest tracked outreach after a prior bug bound the wrong send';
      await this.delayedJobModel
        .updateOne(
          { _id: row._id, status: 'pending' },
          {
            $set: {
              runAt: new Date(),
              lastEmailTrackingToken: latest,
              'emailWait.trackingToken': latest,
              accumulatedResults: [
                ...((row.accumulatedResults as string[]) || []),
                note,
              ],
            },
          },
        )
        .exec();
      rebound++;
      if (latestOpened) nudged++;
    }

    if (nudged > 0 || rebound > 0) {
      this.logger.warn(
        `[Workflows] emailWait recovery: nudged ${nudged}, rebound ${rebound} pending job(s)`,
      );
      this.nudgeDueDelayedJobsIfIdle();
    }
  }

  /**
   * When open deadline passed but alternates never sent (e.g. missing job snapshot),
   * re-queue automatically — same logic as manual retry, without user action.
   */
  private async recoverMissedFollowUpAlternateSends(): Promise<void> {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const candidateFilter: any = {
      branchLabel: 'Follow-up sequence',
      status: { $in: ['done', 'failed'] },
      updatedAt: { $gte: since },
      autoRecoveryBlockedAt: { $exists: false },
      $or: [
        { 'emailWait.firstOutreachGate': true },
        { engagementAlternateSteps: { $exists: true, $not: { $size: 0 } } },
        { 'emailWait.alternateSteps': { $exists: true, $not: { $size: 0 } } },
      ],
    };
    const hasCandidates = await this.delayedJobModel.exists(candidateFilter);
    if (!hasCandidates) return;

    const terminalJobs = await this.delayedJobModel
      .find(candidateFilter)
      .select(
        'entityType entityId accumulatedResults errorMessage emailWait engagementAlternateSteps',
      )
      .sort({ updatedAt: -1 })
      .limit(12)
      .lean()
      .exec();

    const seen = new Set<string>();
    let recovered = 0;
    for (const row of terminalJobs) {
      const entityType = row.entityType as WorkflowEntityType;
      const entityId = String(row.entityId);
      const key = `${entityType}:${entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const { pendingJobs, recentTerminalJob } =
        await this.resolveFollowUpJobsForEntity(entityType, entityId);
      if (pendingJobs.length > 0) continue;

      const configSourceJobs = recentTerminalJob ? [recentTerminalJob] : [];
      const editableConfig =
        this.resolveFollowUpEditableConfigFromJobs(configSourceJobs);
      const altSteps =
        editableConfig?.firstOutreachEngagement?.alternateSteps || [];
      if (!altSteps.length) {
        await this.blockAutoRecoveryForJob(row._id, 'no alternate steps in config');
        continue;
      }

      const eligibility = await this.getFollowUpRetryEligibility(
        entityType,
        entityId,
        [],
        recentTerminalJob,
        editableConfig,
        { forAutoRecovery: true },
      );
      if (!eligibility.eligible) {
        if (
          recentTerminalJob &&
          (eligibility.reason?.includes('Cannot auto-recover') ||
            eligibility.reason?.includes('already attempted') ||
            eligibility.reason?.includes('mailbox not found'))
        ) {
          await this.blockAutoRecoveryForJob(row._id, eligibility.reason);
        }
        continue;
      }

      try {
        await this.requeueMissedAlternateSendForEntity(
          entityType,
          entityId,
          altSteps,
          undefined,
          FOLLOW_UP_AUTO_RECOVERY_NOTE,
        );
        recovered++;
        this.logger.warn(
          `[Workflows] auto-recovered missed alternate send for ${entityType} ${entityId}`,
        );
      } catch (e) {
        this.logger.warn(
          `[Workflows] auto-recover alternate send failed for ${entityType} ${entityId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        await this.blockAutoRecoveryForJob(
          row._id,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    if (recovered > 0) {
      this.nudgeDueDelayedJobsIfIdle();
    }
  }

  private async abortDelayedJobForMissingWorkflow(
    job: WorkflowDelayedJobDocument,
    reason: string,
  ): Promise<'cancelled'> {
    await this.delayedJobModel
      .updateOne(
        { _id: job._id },
        { $set: { status: 'cancelled', cancelReason: reason } },
      )
      .exec();
    await this.logExecution({
      workflowId: job.workflowId as Types.ObjectId,
      entityType: job.entityType,
      entityId: job.entityId,
      trigger: job.trigger as WorkflowTrigger,
      status: 'skipped',
      skipReason: reason,
      actionResults: (job.accumulatedResults || []) as string[],
      branchLabel: job.branchLabel,
      hadScheduledDelay: true,
    });
    return 'cancelled';
  }

  private async resumeDelayedJob(
    job: WorkflowDelayedJobDocument,
  ): Promise<'done' | 'rescheduled' | 'cancelled'> {
    if (job.emailWait) {
      return this.resumeEmailWaitJob(job);
    }

    const wf = await this.workflowModel.findById(job.workflowId).lean().exec();
    if (!wf) {
      return this.abortDelayedJobForMissingWorkflow(
        job,
        'Workflow no longer exists',
      );
    }
    if (!wf.enabled) {
      return this.abortDelayedJobForMissingWorkflow(
        job,
        'Workflow disabled',
      );
    }

    const fresh = await this.fetchEntityRecord(job.entityType, job.entityId);
    if (!fresh) {
      throw new Error('Record no longer exists');
    }

    const event: WorkflowDispatchEvent = {
      trigger: job.trigger,
      entityType: job.entityType,
      entityId: job.entityId,
      record: fresh,
      previous: null,
      user: job.userSnapshot as WorkflowDispatchEvent['user'],
    };

    const ctx = this.initRunContext(wf as Workflow, job);

    if (await this.shouldCancelDueToReplyForEvent(wf as Workflow, ctx, event)) {
      await this.delayedJobModel
        .updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'cancelled',
              cancelReason: 'Recipient replied before scheduled send',
            },
          },
        )
        .exec();
      await this.logExecution({
        workflowId: wf!._id,
        entityType: job.entityType,
        entityId: job.entityId,
        trigger: job.trigger,
        status: 'skipped',
        skipReason: 'Recipient replied — follow-up cancelled',
        actionResults: job.accumulatedResults || [],
        branchLabel: job.branchLabel,
        hadScheduledDelay: true,
      });
      return 'cancelled';
    }

    if (job.executionMode === 'canvas' && job.canvasGraphSnapshot) {
      if (!job.canvasNextNodeId && !job.pendingCanvasEmailAction) {
        return 'done';
      }
      await this.resumeCanvasDelayedJob(
        job,
        wf as Workflow & { _id: Types.ObjectId },
        event,
        ctx,
      );
      return 'done';
    }

    const steps = (job.stepsRemaining || []) as WorkflowStep[];
    const results = [...(job.accumulatedResults || [])];
    const authorId = this.resolveAuthorId(event);

    const scheduled = await this.runStepList(
      wf as Workflow & { _id: Types.ObjectId },
      event,
      authorId,
      steps,
      results,
      job.branchLabel,
      ctx,
      (job as { _id?: Types.ObjectId })._id,
    );

    if (scheduled) {
      await this.logWorkflowScheduleToTimeline({
        workflowId: wf._id,
        entityType: job.entityType,
        entityId: job.entityId,
        trigger: job.trigger,
        branchLabel: job.branchLabel,
        actionResults: results,
        event,
      });
      return 'done';
    }

    await this.logExecution({
      workflowId: wf._id,
      entityType: job.entityType,
      entityId: job.entityId,
      trigger: job.trigger,
      status: 'success',
      actionResults: results,
      branchLabel: job.branchLabel,
      hadScheduledDelay: true,
    });

    if (
      job.branchLabel === 'Follow-up sequence' &&
      job.entityType === 'Lead'
    ) {
      void this.leadEngagementAutomation.onLeadFollowUpSequenceComplete(
        String(job.entityId),
      );
    }

    if (enrollmentOnce(wf as Workflow)) {
      try {
        await this.enrollmentModel.create({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
        });
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
      }
    }
    return 'done';
  }

  /**
   * Send one alternate engagement step, then poll for open before the next step or follow-ups.
   */
  private async sendAlternateEngagementStepAndWait(
    job: WorkflowDelayedJobDocument,
    wf: Workflow & { _id: Types.ObjectId },
    event: WorkflowDispatchEvent,
    authorId: Types.ObjectId | undefined,
    results: string[],
    altSteps: FollowUpNotOpenedResendDto[],
    sendIndex: number,
    resultNote: string,
  ): Promise<boolean> {
    results.push(resultNote);
    const stepDto = altSteps[sendIndex];
    const altRaw = stepDto.inboxAccountId?.trim();
    if (!altRaw || !Types.ObjectId.isValid(altRaw)) {
      results.push(`Alternate step ${sendIndex + 1}: invalid mailbox — skipped`);
      if (sendIndex + 1 < altSteps.length) {
        return this.sendAlternateEngagementStepAndWait(
          job,
          wf,
          event,
          authorId,
          results,
          altSteps,
          sendIndex + 1,
          `Skipping to alternate step ${sendIndex + 2}`,
        );
      }
      return false;
    }
    const altAction = this.buildFollowUpEmailAction(stepDto, altRaw);
    if (!altAction) {
      results.push(
        `Alternate step ${sendIndex + 1}: missing email content — skipped`,
      );
      if (sendIndex + 1 < altSteps.length) {
        return this.sendAlternateEngagementStepAndWait(
          job,
          wf,
          event,
          authorId,
          results,
          altSteps,
          sendIndex + 1,
          `Skipping to alternate step ${sendIndex + 2}`,
        );
      }
      return false;
    }

    const priorWait = job.emailWait;
    const pollIntervalMs = priorWait?.pollIntervalMs || 5 * 60 * 1000;

    const sendCtx = this.initRunContext(wf as Workflow, job);
    sendCtx.alternateEngagementSteps = altSteps;
    sendCtx.alternateEngagementStepIndex = sendIndex;
    // Alternate steps must send from their configured mailbox, not a locked follow-up sender.
    sendCtx.lockedInboxAccountId = undefined;
    const scheduledSend = await this.runStepList(
      wf,
      event,
      authorId,
      [{ type: 'action', action: altAction }],
      results,
      job.branchLabel,
      sendCtx,
      job._id,
    );
    if (scheduledSend) {
      return true;
    }

    const emailSent = results.some((r) => /^Email sent/i.test(String(r)));
    if (!emailSent) {
      await this.logExecution({
        workflowId: wf._id,
        entityType: job.entityType,
        entityId: job.entityId,
        trigger: job.trigger,
        status: 'failed',
        actionResults: results.slice(-12),
        errorMessage:
          'Alternate email was not sent — check mailbox connection, template, and recipient email',
        branchLabel: job.branchLabel,
        hadScheduledDelay: true,
      });
      return false;
    }

    const freshJob = await this.delayedJobModel
      .findById(job._id)
      .select('sendGuard lastEmailTrackingToken')
      .lean()
      .exec();
    const guard = freshJob?.sendGuard as
      | { trackingToken?: string }
      | undefined;
    let newToken =
      guard?.trackingToken ||
      freshJob?.lastEmailTrackingToken ||
      undefined;
    if (!newToken) {
      newToken = sendCtx.lastEmailTrackingToken;
    }
    if (!newToken) {
      newToken = await this.resolveLatestManualOutreachToken(
        String(job.entityId),
      );
    }
    if (!newToken) {
      results.push(
        `Alternate step ${sendIndex + 1} sent (open tracking unavailable — continuing on timer)`,
      );
      const now = Date.now();
      const altWaitMs = Math.max(60_000, this.resolveNotOpenedWaitMs(stepDto));
      const altDeadline = new Date(now + altWaitMs);
      const firstPollMs = Math.min(
        5 * 60 * 1000,
        Math.max(5000, altDeadline.getTime() - now),
      );
      await this.delayedJobModel.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'pending',
            runAt: new Date(now + firstPollMs),
            accumulatedResults: results,
            engagementAlternateSteps: altSteps,
            followUpCadenceSteps: job.followUpCadenceSteps,
            emailWait: {
              trackingToken: '__no_token__',
              deadlineAt: altDeadline,
              pollIntervalMs: priorWait?.pollIntervalMs || 5 * 60 * 1000,
              branchOnTimeoutSteps: [],
              branchMode: true,
              firstOutreachGate: true,
              alternateStepIndex: sendIndex,
              alternateSteps: altSteps as unknown[],
              alternateWaitMs: altWaitMs,
            },
          },
        },
      );
      results.push(
        `Waiting ${Math.round(altWaitMs / 60000)}m before next alternate (no open tracking)`,
      );
      return true;
    }

    const now = Date.now();
    const altWaitMs = Math.max(60_000, this.resolveNotOpenedWaitMs(stepDto));
    const altDeadline = new Date(now + altWaitMs);
    const trkAfterSend = await this.emailTrackingService.findByToken(newToken);
    const alreadyOpenedAfterSend = !!(
      trkAfterSend?.lastOpenedAt || (Number(trkAfterSend?.openCount) || 0) > 0
    );
    const firstPollMs = alreadyOpenedAfterSend
      ? 0
      : Math.min(5 * 60 * 1000, Math.max(5000, altDeadline.getTime() - now));
    await this.delayedJobModel.updateOne(
      { _id: job._id },
      {
        $set: {
          status: 'pending',
          runAt: new Date(now + firstPollMs),
          lastEmailTrackingToken: newToken,
          accumulatedResults: results,
          engagementAlternateSteps: altSteps,
          followUpCadenceSteps: job.followUpCadenceSteps,
          emailWait: {
            trackingToken: newToken,
            deadlineAt: altDeadline,
            pollIntervalMs,
            branchOnTimeoutSteps: [],
            branchMode: true,
            firstOutreachGate: true,
            alternateStepIndex: sendIndex,
            alternateSteps: altSteps as unknown[],
            alternateWaitMs: altWaitMs,
          },
        },
      },
    );
    if (alreadyOpenedAfterSend) {
      results.push(
        `Alternate step ${sendIndex + 1} already opened — advancing immediately`,
      );
      this.nudgeDueDelayedJobsIfIdle();
    } else {
      results.push(
        `Waiting for alternate step ${sendIndex + 1} open until ${altDeadline.toISOString()}`,
      );
    }
    return true;
  }

  /**
   * Poll EmailTracking until open or deadline; same job row is re-queued with status pending.
   */
  /** Follow-up sequence: poll open on last send; on timeout run alternate email steps. */
  private async resumeBranchEmailWaitJob(
    job: WorkflowDelayedJobDocument,
  ): Promise<'done' | 'rescheduled' | 'cancelled'> {
    this.logger.log(
      `[Workflows] resumeBranchEmailWaitJob starting: Job ID = ${job._id}, Entity = ${job.entityType} (${job.entityId}), Branch = ${job.branchLabel || 'None'}`,
    );
    const live = await this.delayedJobModel.findById(job._id).lean().exec();
    if (!live) {
      this.logger.warn(
        `[Workflows] resumeBranchEmailWaitJob: Job document ${job._id} not found in database. Ending.`,
      );
      return 'done';
    }
    if (!live.emailWait) {
      this.logger.warn(
        `[Workflows] resumeBranchEmailWaitJob: Job document ${job._id} does not have emailWait schema. Ending.`,
      );
      return 'done';
    }
    job = live as WorkflowDelayedJobDocument;

    const wf = await this.workflowModel.findById(job.workflowId).lean().exec();
    if (!wf) {
      return this.abortDelayedJobForMissingWorkflow(
        job,
        'Workflow no longer exists',
      );
    }
    if (!wf.enabled) {
      return this.abortDelayedJobForMissingWorkflow(
        job,
        'Workflow disabled',
      );
    }

    const ew = job.emailWait!;
    const fresh = await this.fetchEntityRecord(job.entityType, job.entityId);
    if (!fresh) {
      this.logger.error(
        `[Workflows] resumeBranchEmailWaitJob: Entity record ${job.entityType} (${job.entityId}) no longer exists. Throwing error for job ${job._id}.`,
      );
      throw new Error('Record no longer exists');
    }

    const event: WorkflowDispatchEvent = {
      trigger: job.trigger,
      entityType: job.entityType,
      entityId: job.entityId,
      record: fresh,
      previous: null,
      user: job.userSnapshot as WorkflowDispatchEvent['user'],
    };

    const noOutreachToken =
      !ew.trackingToken || ew.trackingToken === '__no_token__';
    this.logger.log(
      `[Workflows] resumeBranchEmailWaitJob: Checking token: ${ew.trackingToken}. isNoToken = ${noOutreachToken}`,
    );
    const trk = noOutreachToken
      ? null
      : await this.emailTrackingService.findByToken(ew.trackingToken);
    
    if (!noOutreachToken && !trk) {
      this.logger.warn(
        `[Workflows] resumeBranchEmailWaitJob: Tracking token ${ew.trackingToken} was not found in database.`,
      );
    }
    
    const opened = !!(trk?.lastOpenedAt || (trk?.openCount ?? 0) > 0);
    this.logger.log(
      `[Workflows] resumeBranchEmailWaitJob: Opened status = ${opened} (openCount = ${trk?.openCount ?? 0}, lastOpenedAt = ${trk?.lastOpenedAt})`,
    );
    const deadlineMs = new Date(ew.deadlineAt).getTime();
    const now = Date.now();
    const results = [...(job.accumulatedResults || [])];
    const authorId = this.resolveAuthorId(event);
    const ctx = this.initRunContext(wf as Workflow, job);

    const continueSequence = async (
      resultNote: string,
      openedTracking?: { accountId?: Types.ObjectId | string; fromEmail?: string } | null,
    ) => {
      this.logger.log(
        `[Workflows] resumeBranchEmailWaitJob continueSequence: initiating follow-up steps. Note: ${resultNote}`,
      );
      results.push(resultNote);
      await this.delayedJobModel
        .updateOne({ _id: job._id }, { $unset: { emailWait: 1 } })
        .exec();
      const cadenceDtos = (job.followUpCadenceSteps ||
        []) as FollowUpSequenceStepDto[];
      let stepsToRun = (job.stepsRemaining || []) as WorkflowStep[];
      const sendFrom = await this.resolveFollowUpSendAccountAfterEngagement(
        job,
        openedTracking,
      );
      if (sendFrom.accountId) {
        ctx.lockedInboxAccountId = sendFrom.accountId;
        await this.delayedJobModel
          .updateOne(
            { _id: job._id },
            {
              $set: {
                lockedInboxAccountId: new Types.ObjectId(sendFrom.accountId),
              },
            },
          )
          .exec();
        results.push(
          sendFrom.fromEmail
            ? `Follow-up emails will send from ${sendFrom.fromEmail} (the mailbox they opened)`
            : 'Follow-up emails will send from the mailbox they opened',
        );
      }
      const resolveCadenceMailbox = (s: FollowUpSequenceStepDto) =>
        sendFrom.accountId ?? this.resolveFollowUpStepAccountFromJob(job, s);
      if (cadenceDtos.length > 0) {
        stepsToRun = this.buildFollowUpWorkflowStepsFromDtos(
          cadenceDtos,
          Date.now(),
          resolveCadenceMailbox,
        );
        results.push(
          'Follow-up cadence starting now (Day 2 / 5 / 7 delays count from this open)',
        );
      }
      const scheduled = await this.runStepList(
        wf as Workflow & { _id: Types.ObjectId },
        event,
        authorId,
        stepsToRun,
        results,
        job.branchLabel,
        ctx,
        job._id,
      );
      if (!scheduled) {
        await this.logExecution({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
          trigger: job.trigger,
          status: 'success',
          actionResults: results,
          branchLabel: job.branchLabel,
          hadScheduledDelay: true,
        });
        if (
          job.branchLabel === 'Follow-up sequence' &&
          job.entityType === 'Lead'
        ) {
          void this.leadEngagementAutomation.onLeadFollowUpSequenceComplete(
            String(job.entityId),
          );
        }
      }
    };

    const altSteps = await this.recoverAndPersistAlternateStepsForJob(job);
    const stepIndex =
      ew.alternateStepIndex !== undefined && ew.alternateStepIndex !== null
        ? Number(ew.alternateStepIndex)
        : ew.alternateSent
          ? 0
          : -1;

    if (opened) {
      const note =
        stepIndex < 0
          ? 'First outreach opened — remaining alternate steps cancelled, starting follow-up cadence'
          : `Alternate step ${stepIndex + 1} opened — remaining steps cancelled, starting follow-up cadence`;
      await continueSequence(note, trk);
      return 'done';
    }

    if (now >= deadlineMs) {
      this.logger.log(
        `[Workflows] resumeBranchEmailWaitJob: Deadline reached (deadlineMs = ${deadlineMs}, now = ${now})`,
      );
      const expectedAlternates =
        ew.firstOutreachGate ||
        (Array.isArray(job.engagementAlternateSteps) &&
          job.engagementAlternateSteps.length > 0) ||
        this.accumulatedResultsExpectAlternates(job.accumulatedResults) ||
        this.accumulatedResultsExpectAlternates(results);

      if (altSteps.length === 0 && expectedAlternates) {
        await this.logMissingAlternateStepsFailure(
          wf as Workflow & { _id: Types.ObjectId },
          job,
          results,
          job.trigger,
        );
        return 'done';
      }

      if (
        altSteps.length === 0 &&
        ew.branchMode &&
        !ew.firstOutreachGate &&
        this.accumulatedResultsExpectAlternates(job.accumulatedResults)
      ) {
        results.push(
          'Alternate emails were not queued (fixed in a later release). Re-start the follow-up sequence to send alternates.',
        );
        await this.logExecution({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
          trigger: job.trigger,
          status: 'failed',
          actionResults: results,
          errorMessage: 'Open-tracking alternates were not persisted on this job',
          branchLabel: job.branchLabel,
          hadScheduledDelay: true,
        });
        return 'done';
      }

      if (altSteps.length > 0) {
        const nextSendIndex = stepIndex < 0 ? 0 : stepIndex + 1;
        if (nextSendIndex < altSteps.length) {
          const rescheduled = await this.sendAlternateEngagementStepAndWait(
            job,
            wf as Workflow & { _id: Types.ObjectId },
            event,
            authorId,
            results,
            altSteps,
            nextSendIndex,
            stepIndex < 0
              ? 'First outreach not opened — sending alternate step 1'
              : `Alternate step ${stepIndex + 1} not opened — sending alternate step ${nextSendIndex + 1}`,
          );
          if (!rescheduled) {
            const sent = results.some((r) => /^Email sent/i.test(String(r)));
            await this.logExecution({
              workflowId: wf._id,
              entityType: job.entityType,
              entityId: job.entityId,
              trigger: job.trigger,
              status: sent ? 'success' : 'failed',
              actionResults: results,
              errorMessage: sent
                ? undefined
                : 'Alternate email step did not send (check mailbox and template)',
              branchLabel: job.branchLabel,
              hadScheduledDelay: true,
            });
          }
          return rescheduled ? 'rescheduled' : 'done';
        }
        const cadenceOnTimeout = (job.followUpCadenceSteps ||
          []) as FollowUpSequenceStepDto[];
        await this.delayedJobModel
          .updateOne({ _id: job._id }, { $unset: { emailWait: 1 } })
          .exec();
        if (cadenceOnTimeout.length > 0) {
          results.push(
            'Tracked outreach not opened — follow-up cadence not started',
          );
        } else {
          results.push(
            'Tracked outreach not opened — open-tracking sequence ended',
          );
        }
        await this.logExecution({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
          trigger: job.trigger,
          status: 'success',
          actionResults: results,
          branchLabel: job.branchLabel,
          hadScheduledDelay: true,
        });
        if (
          job.branchLabel === 'Follow-up sequence' &&
          job.entityType === 'Lead'
        ) {
          void this.leadEngagementAutomation.onLeadFollowUpSequenceComplete(
            String(job.entityId),
          );
        }
        return 'done';
      }

      const cadenceDtosOnTimeout = (job.followUpCadenceSteps ||
        []) as FollowUpSequenceStepDto[];
      if (ew.firstOutreachGate && cadenceDtosOnTimeout.length > 0) {
        await this.delayedJobModel
          .updateOne({ _id: job._id }, { $unset: { emailWait: 1 } })
          .exec();
        results.push(
          'Tracked outreach not opened — follow-up cadence not started',
        );
        await this.logExecution({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
          trigger: job.trigger,
          status: 'success',
          actionResults: results,
          branchLabel: job.branchLabel,
          hadScheduledDelay: true,
        });
        if (
          job.branchLabel === 'Follow-up sequence' &&
          job.entityType === 'Lead'
        ) {
          void this.leadEngagementAutomation.onLeadFollowUpSequenceComplete(
            String(job.entityId),
          );
        }
        return 'done';
      }

      const timeoutSteps = (ew.branchOnTimeoutSteps || []) as WorkflowStep[];
      const merged = [
        ...timeoutSteps,
        ...((job.stepsRemaining || []) as WorkflowStep[]),
      ];
      await this.delayedJobModel
        .updateOne({ _id: job._id }, { $unset: { emailWait: 1 } })
        .exec();
      const scheduled = await this.runStepList(
        wf as Workflow & { _id: Types.ObjectId },
        event,
        authorId,
        merged,
        results,
        job.branchLabel,
        ctx,
        job._id,
      );
      if (!scheduled) {
        await this.logExecution({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
          trigger: job.trigger,
          status: 'success',
          actionResults: results,
          branchLabel: job.branchLabel,
          hadScheduledDelay: true,
        });
      }
      return 'done';
    }

    const pollMs = Math.max(
      5000,
      Math.min(ew.pollIntervalMs || 5 * 60 * 1000, deadlineMs - now),
    );
    const runAt =
      deadlineMs > now && deadlineMs - now <= pollMs
        ? new Date(deadlineMs)
        : new Date(now + pollMs);
    this.logger.log(
      `[Workflows] resumeBranchEmailWaitJob: Rescheduling poll in ${pollMs}ms. runAt = ${runAt.toISOString()}`,
    );
    await this.delayedJobModel
      .updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'pending',
            runAt,
            accumulatedResults: results,
            ...(this.resolveEngagementAlternateSteps(job).length === 0 &&
            Array.isArray(job.emailWait?.alternateSteps) &&
            job.emailWait!.alternateSteps!.length > 0
              ? {
                  engagementAlternateSteps: job.emailWait!.alternateSteps,
                }
              : {}),
          },
        },
      )
      .exec();
    return 'rescheduled';
  }

  private async resumeEmailWaitJob(
    job: WorkflowDelayedJobDocument,
  ): Promise<'done' | 'rescheduled' | 'cancelled'> {
    const wf = await this.workflowModel.findById(job.workflowId).lean().exec();
    if (!wf) {
      return this.abortDelayedJobForMissingWorkflow(
        job,
        'Workflow no longer exists',
      );
    }
    if (!wf.enabled) {
      return this.abortDelayedJobForMissingWorkflow(
        job,
        'Workflow disabled',
      );
    }
    if (job.emailWait?.branchMode) {
      return this.resumeBranchEmailWaitJob(job);
    }
    const ew = job.emailWait!;
    const fresh = await this.fetchEntityRecord(job.entityType, job.entityId);
    if (!fresh) {
      throw new Error('Record no longer exists');
    }
    const event: WorkflowDispatchEvent = {
      trigger: job.trigger,
      entityType: job.entityType,
      entityId: job.entityId,
      record: fresh,
      previous: null,
      user: job.userSnapshot as WorkflowDispatchEvent['user'],
    };

    const trk = await this.emailTrackingService.findByToken(ew.trackingToken);
    const opened = !!(trk?.lastOpenedAt || (trk?.openCount ?? 0) > 0);
    if (opened) {
      await this.delayedJobModel
        .updateOne({ _id: job._id }, { $unset: { emailWait: 1 } })
        .exec();
      await this.resumeCanvasAfterEmailWait(
        job,
        wf as Workflow & { _id: Types.ObjectId },
        event,
        ew.onOpenNodeId || WORKFLOW_EMAIL_WAIT_OPEN_END_ID,
      );
      return 'done';
    }

    const deadlineMs = new Date(ew.deadlineAt).getTime();
    const now = Date.now();
    const onOpenId = ew.onOpenNodeId || WORKFLOW_EMAIL_WAIT_OPEN_END_ID;
    const onTimeoutId = ew.onTimeoutNodeId || WORKFLOW_EMAIL_WAIT_OPEN_END_ID;
    const yesOnlyOpenFlow =
      onOpenId !== WORKFLOW_EMAIL_WAIT_OPEN_END_ID &&
      onTimeoutId === WORKFLOW_EMAIL_WAIT_OPEN_END_ID;
    if (now >= deadlineMs && yesOnlyOpenFlow) {
      // Yes-only wait-open flows should keep listening for late opens.
      const pollMs = Math.max(5000, ew.pollIntervalMs || 5 * 60 * 1000);
      await this.delayedJobModel
        .updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'pending',
              runAt: new Date(now + pollMs),
            },
          },
        )
        .exec();
      return 'rescheduled';
    }
    if (now >= deadlineMs) {
      await this.delayedJobModel
        .updateOne({ _id: job._id }, { $unset: { emailWait: 1 } })
        .exec();
      await this.resumeCanvasAfterEmailWait(
        job,
        wf as Workflow & { _id: Types.ObjectId },
        event,
        onTimeoutId,
      );
      return 'done';
    }

    const pollMs = Math.max(
      5000,
      Math.min(ew.pollIntervalMs, deadlineMs - now),
    );
    await this.delayedJobModel
      .updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'pending',
            runAt: new Date(now + pollMs),
          },
        },
      )
      .exec();
    return 'rescheduled';
  }

  private async resumeCanvasAfterEmailWait(
    job: WorkflowDelayedJobDocument,
    wf: Workflow & { _id: Types.ObjectId },
    event: WorkflowDispatchEvent,
    startNodeId: string,
  ): Promise<void> {
    const graph = job.canvasGraphSnapshot as WorkflowCanvasGraph;
    const results = [...(job.accumulatedResults || [])];
    const authorId = this.resolveAuthorId(event);
    const inherited = job.abVariant;
    const ctx: WorkflowRunContext = {
      lastEmailTrackingToken: job.lastEmailTrackingToken,
    };

    const { scheduled, finalVariant } = await this.executeCanvasTraversal(
      wf,
      event,
      graph,
      results,
      authorId,
      startNodeId,
      inherited,
      ctx,
    );

    if (scheduled) {
      await this.logWorkflowScheduleToTimeline({
        workflowId: wf._id,
        entityType: job.entityType,
        entityId: job.entityId,
        trigger: job.trigger,
        branchLabel: 'Canvas',
        actionResults: results,
        event,
      });
      return;
    }

    if (enrollmentOnce(wf as Workflow)) {
      try {
        await this.enrollmentModel.create({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
        });
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
      }
    }

    await this.logExecution({
      workflowId: wf._id,
      entityType: job.entityType,
      entityId: job.entityId,
      trigger: job.trigger,
      status: 'success',
      actionResults: results,
      branchLabel: 'Canvas',
      hadScheduledDelay: true,
      variant: finalVariant,
    });
  }

  private async fetchEntityRecord(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    if (entityType === 'Lead') {
      const d = await this.leadModel.findById(entityId).lean().exec();
      return d as Record<string, unknown> | null;
    }
    if (entityType === 'Contact') {
      const d = await this.contactModel.findById(entityId).lean().exec();
      return d as Record<string, unknown> | null;
    }
    const d = await this.organizationModel.findById(entityId).lean().exec();
    return d as Record<string, unknown> | null;
  }

  private async processEvent(event: WorkflowDispatchEvent): Promise<void> {
    const workflows = await this.workflowModel
      .find({
        enabled: true,
        $or: [{ trigger: event.trigger }, { triggers: event.trigger }],
      })
      .lean()
      .exec();

    for (const wf of workflows) {
      try {
        await this.runOne(wf as Workflow & { _id: Types.ObjectId }, event);
      } catch (e: any) {
        this.logger.error(
          `[Workflows] workflow ${wf._id} failed: ${e?.message || e}`,
        );
      }
    }
  }

  private strId(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'object' && v !== null && '_id' in v) {
      return String((v as { _id?: unknown })._id ?? '');
    }
    return String(v);
  }

  private segmentModuleForEntity(
    entityType: WorkflowEntityType,
  ): 'leads' | 'contacts' | null {
    if (entityType === 'Lead') return 'leads';
    if (entityType === 'Contact') return 'contacts';
    return null;
  }

  private async evalSegmentFilter(
    f: WorkflowFilter,
    event: WorkflowDispatchEvent,
  ): Promise<boolean> {
    const segmentId = String(f.value ?? '').trim();
    if (!Types.ObjectId.isValid(segmentId)) return false;
    const mod = this.segmentModuleForEntity(event.entityType);
    if (!mod) return false;
    const inSegment = await this.segmentsService.isEntityInSegment(
      segmentId,
      mod,
      String(event.entityId),
      event.user,
    );
    if (f.operator === 'not_in_segment') return !inSegment;
    return inSegment;
  }

  private entityTypeToTrackingModule(
    t: WorkflowEntityType,
  ): 'leads' | 'contacts' | 'organizations' | null {
    switch (t) {
      case 'Lead':
        return 'leads';
      case 'Contact':
        return 'contacts';
      case 'Organization':
        return 'organizations';
      default:
        return null;
    }
  }

  private async evalEventFilter(
    f: WorkflowFilter,
    event: WorkflowDispatchEvent,
  ): Promise<boolean> {
    const kind = (f as { filterKind?: string }).filterKind;
    if (kind !== 'event') return true;
    const et = (f as { eventType?: string }).eventType;
    if (!et) return false;
    const mod = this.entityTypeToTrackingModule(event.entityType);
    if (!mod) return false;
    const id = String(event.entityId);
    const sum = await this.emailTrackingService.summarizeEngagementForCrmRecord(
      id,
      mod,
    );
    switch (et) {
      case 'crm_email_has_been_opened':
        return sum.anyOpened;
      case 'crm_email_sent_but_never_opened':
        return sum.anySend && !sum.anyOpened;
      default:
        return false;
    }
  }

  /** Entry criteria, branch filters, canvas conditions, goals — property and/or event rules (AND). */
  private async passesFiltersAsync(
    filters: WorkflowFilter[],
    event: WorkflowDispatchEvent,
  ): Promise<{ ok: boolean; reason?: string }> {
    const record = event.record;
    const prev = event.previous;

    for (const f of filters) {
      const kind = (f as { filterKind?: string }).filterKind;
      if (kind === 'event') {
        const ok = await this.evalEventFilter(f, event);
        if (!ok) {
          return {
            ok: false,
            reason: `Filter failed: event ${(f as { eventType?: string }).eventType || 'unknown'}`,
          };
        }
      } else if (kind === 'segment') {
        const ok = await this.evalSegmentFilter(f, event);
        if (!ok) {
          return {
            ok: false,
            reason: `Filter failed: segment ${String(f.value ?? '')} ${f.operator}`,
          };
        }
      } else {
        if (!this.evalFilter(f, record, prev)) {
          return { ok: false, reason: `Filter failed: ${f.field} ${f.operator}` };
        }
      }
    }
    return { ok: true };
  }

  private evalFilter(
    f: WorkflowFilter,
    record: Record<string, unknown>,
    prev: Record<string, unknown> | null | undefined,
  ): boolean {
    const cur = getAtPath(record, f.field);
    const was = prev ? getAtPath(prev, f.field) : undefined;

    switch (f.operator) {
      case 'equals':
        return compareVals(cur, f.value as string | number | boolean);
      case 'not_equals':
        return !compareVals(cur, f.value as string | number | boolean);
      case 'contains':
        return String(cur ?? '')
          .toLowerCase()
          .includes(String(f.value ?? '').toLowerCase());
      case 'not_contains':
        return !String(cur ?? '')
          .toLowerCase()
          .includes(String(f.value ?? '').toLowerCase());
      case 'is_empty':
        return isEmptyValue(cur);
      case 'is_not_empty':
        return !isEmptyValue(cur);
      case 'changed_to':
        if (!prev) return false;
        return (
          !compareVals(was, f.value as string | number | boolean) &&
          compareVals(cur, f.value as string | number | boolean)
        );
      case 'changed_from_to': {
        if (!prev) return false;
        const raw = String(f.value ?? '');
        const sep = raw.includes('=>') ? '=>' : raw.includes('->') ? '->' : '';
        if (!sep) return false;
        const [fromRaw, toRaw] = raw.split(sep);
        const fromVal = String(fromRaw ?? '').trim();
        const toVal = String(toRaw ?? '').trim();
        if (!fromVal || !toVal) return false;
        return compareVals(was, fromVal) && compareVals(cur, toVal);
      }
      case 'greater_than':
        return Number(cur) > Number(f.value);
      case 'less_than':
        return Number(cur) < Number(f.value);
      case 'in_list': {
        const list = parseList(f.value);
        const c = normalizeComparable(cur);
        return list.includes(c);
      }
      case 'not_in_list': {
        const list = parseList(f.value);
        const c = normalizeComparable(cur);
        return !list.includes(c);
      }
      case 'in_segment':
      case 'not_in_segment':
        return false;
      default:
        return false;
    }
  }

  private async pickBranch(
    branches: WorkflowBranch[],
    event: WorkflowDispatchEvent,
  ): Promise<WorkflowBranch | null> {
    let elseBranch: WorkflowBranch | null = null;
    for (const b of branches) {
      if (b.isElse) {
        elseBranch = b;
        continue;
      }
      const fl = b.filters || [];
      const r = await this.passesFiltersAsync(fl, event);
      if (r.ok) return b;
    }
    return elseBranch;
  }

  private async runOne(
    wf: Workflow & { _id: Types.ObjectId },
    event: WorkflowDispatchEvent,
  ): Promise<void> {
    const entityId = event.entityId;
    const once = enrollmentOnce(wf);

    if (once) {
      const existing = await this.enrollmentModel
        .findOne({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId,
        })
        .exec();
      if (existing) {
        await this.logExecution({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId,
          trigger: event.trigger,
          status: 'skipped',
          skipReason: 'Enrollment: already ran once for this record',
          actionResults: [],
        });
        return;
      }
    }

    if (this.usesTriggerAllCombine(wf)) {
      const req = this.requiredTriggers(wf);
      const progressed = await this.triggerProgressModel
        .findOneAndUpdate(
          {
            workflowId: wf._id,
            entityType: event.entityType,
            entityId,
          },
          { $addToSet: { fired: event.trigger } },
          { upsert: true, new: true },
        )
        .exec();
      const fired = new Set((progressed?.fired || []) as WorkflowTrigger[]);
      if (!req.every((t) => fired.has(t))) {
        return;
      }
    }

    const entry = await this.passesFiltersAsync(wf.filters || [], event);
    if (!entry.ok) {
      await this.logExecution({
        workflowId: wf._id,
        entityType: event.entityType,
        entityId,
        trigger: event.trigger,
        status: 'skipped',
        skipReason: entry.reason,
        actionResults: [],
      });
      return;
    }

    if (this.usesTriggerAllCombine(wf)) {
      const req = this.requiredTriggers(wf);
      const claimed = await this.triggerProgressModel
        .findOneAndDelete({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId,
          fired: { $all: req },
        })
        .exec();
      if (!claimed) {
        return;
      }
    }

    if (
      (wf as Workflow & { editorMode?: string }).editorMode === 'canvas' &&
      (wf as any).canvasGraph?.nodes?.length
    ) {
      await this.runCanvasWorkflow(
        wf as Workflow & { _id: Types.ObjectId },
        event,
      );
      return;
    }

    const branches = normalizeBranches(wf);
    const branch = await this.pickBranch(branches, event);
    if (!branch || !(branch.steps || []).length) {
      await this.logExecution({
        workflowId: wf._id,
        entityType: event.entityType,
        entityId,
        trigger: event.trigger,
        status: 'skipped',
        skipReason: branch
          ? 'No steps in matched branch'
          : 'No matching branch',
        actionResults: [],
        branchLabel: branch?.label,
      });
      return;
    }

    const results: string[] = [];
    const authorId = this.resolveAuthorId(event);
    const ctx = this.initRunContext(wf as Workflow);
    let scheduledDelay = false;

    try {
      scheduledDelay = await this.runStepList(
        wf,
        event,
        authorId,
        branch.steps || [],
        results,
        branch.label,
        ctx,
      );
        if (scheduledDelay) {
        await this.logWorkflowScheduleToTimeline({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId,
          trigger: event.trigger,
          branchLabel: branch.label,
          actionResults: results,
          event,
        });
        return;
      }

      if (once) {
        try {
          await this.enrollmentModel.create({
            workflowId: wf._id,
            entityType: event.entityType,
            entityId,
          });
        } catch (e: any) {
          if (e?.code !== 11000) throw e;
        }
      }

      await this.logExecution({
        workflowId: wf._id,
        entityType: event.entityType,
        entityId,
        trigger: event.trigger,
        status: 'success',
        actionResults: results,
        branchLabel: branch.label,
      });
    } catch (err: any) {
      await this.logExecution({
        workflowId: wf._id,
        entityType: event.entityType,
        entityId,
        trigger: event.trigger,
        status: 'failed',
        actionResults: results,
        errorMessage: err?.message || String(err),
        branchLabel: branch.label,
      });
    }
  }

  /**
   * @returns true if a delay was scheduled (defer success log / enrollment).
   */
  private async runStepList(
    wf: Workflow & { _id: Types.ObjectId },
    event: WorkflowDispatchEvent,
    authorId: Types.ObjectId | undefined,
    steps: WorkflowStep[],
    results: string[],
    branchLabel: string | undefined,
    ctx: WorkflowRunContext,
    activeJobId?: Types.ObjectId,
  ): Promise<boolean> {
    const claimOnce = enrollmentOnce(wf);
    const stepCtx: WorkflowRunContext = {
      ...ctx,
      ...(activeJobId
        ? { workflowDelayedJobId: String(activeJobId) }
        : {}),
    };
    let i = 0;
    while (i < steps.length) {
      const step = steps[i];
      if (isWaitEmailOpenStep(step)) {
        const waitMs = resolveWaitEmailOpenDeadlineMs(step);
        let token = stepCtx.lastEmailTrackingToken;
        if (!token) {
          const fb = await this.resolveLatestManualOutreachToken(
            String(event.entityId),
          );
          if (fb) {
            token = fb;
            stepCtx.lastEmailTrackingToken = fb;
          }
        }
        const remaining = steps.slice(i + 1);
        const deferCadence = !!(
          stepCtx.cadenceStartsAfterOpen && stepCtx.followUpSequenceStepDtos?.length
        );
        const hasAlternates =
          (stepCtx.alternateEngagementSteps?.length ?? 0) > 0;
        const firstOutreachGate = deferCadence || hasAlternates;
        const deadline = step.deadlineAt
          ? new Date(step.deadlineAt)
          : new Date(Date.now() + waitMs);
        const timeoutSteps = step.onTimeoutSteps || [];
        if (!token) {
          if (hasAlternates) {
            results.push(
              'No open-tracking token on file — alternate sequence will start on the next scheduler tick',
            );
            const msUntilDeadline = deadline.getTime() - Date.now();
            const firstPollMs =
              msUntilDeadline <= 0
                ? 0
                : Math.min(5 * 60 * 1000, Math.max(5000, msUntilDeadline));
            const waitRunAt =
              msUntilDeadline <= 0
                ? new Date()
                : msUntilDeadline <= firstPollMs
                  ? deadline
                  : new Date(Date.now() + firstPollMs);
            const scheduled = await this.persistPendingDelayedJob({
              workflowId: wf._id,
              entityType: event.entityType,
              entityId: event.entityId,
              trigger: event.trigger,
              stepsRemaining: deferCadence ? [] : (remaining as unknown[]),
              followUpCadenceSteps: deferCadence
                ? stepCtx.followUpSequenceStepDtos
                : undefined,
              engagementAlternateSteps: stepCtx.alternateEngagementSteps,
              userSnapshot: event.user as Record<string, unknown> | undefined,
              accumulatedResults: [...results],
              branchLabel,
              runAt: waitRunAt,
              executionMode: 'branch',
              ctx: stepCtx,
              claimOnceEnrollment: claimOnce,
              emailWait: {
                trackingToken: '__no_token__',
                deadlineAt: deadline,
                pollIntervalMs: 5 * 60 * 1000,
                branchOnTimeoutSteps: timeoutSteps as unknown[],
                branchMode: true,
                firstOutreachGate: true,
                alternateStepIndex: -1,
                alternateSteps: stepCtx.alternateEngagementSteps,
                firstWaitMs: waitMs,
              },
            });
            if (!scheduled) {
              results.push(
                'Skipped: workflow already enrolled for this record',
              );
              return false;
            }
            return true;
          }
          results.push(
            'No tracked send for open wait — running not-opened resend immediately',
          );
          const merged = deferCadence
            ? [...timeoutSteps]
            : [...timeoutSteps, ...remaining];
          const scheduled = await this.runStepList(
            wf,
            event,
            authorId,
            merged,
            results,
            branchLabel,
            stepCtx,
            activeJobId,
          );
          return scheduled;
        }
        const firstPollMs = Math.min(
          5 * 60 * 1000,
          Math.max(5000, deadline.getTime() - Date.now()),
        );
        const trkAtSchedule =
          await this.emailTrackingService.findByToken(token);
        const alreadyOpenedAtSchedule = !!(
          trkAtSchedule?.lastOpenedAt ||
          (Number(trkAtSchedule?.openCount) || 0) > 0
        );
        const msUntilDeadline = deadline.getTime() - Date.now();
        const waitRunAt = alreadyOpenedAtSchedule
          ? new Date()
          : msUntilDeadline <= 0
            ? new Date()
            : msUntilDeadline <= firstPollMs
              ? deadline
              : new Date(Date.now() + firstPollMs);
        const scheduledOpenWait = await this.persistPendingDelayedJob({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId: event.entityId,
          trigger: event.trigger,
          stepsRemaining: deferCadence ? [] : (remaining as unknown[]),
          followUpCadenceSteps: deferCadence
            ? stepCtx.followUpSequenceStepDtos
            : undefined,
          engagementAlternateSteps: hasAlternates
            ? stepCtx.alternateEngagementSteps
            : undefined,
          userSnapshot: event.user as Record<string, unknown> | undefined,
          accumulatedResults: [...results],
          branchLabel,
          runAt: waitRunAt,
          executionMode: 'branch',
          ctx: stepCtx,
          claimOnceEnrollment: claimOnce,
          lastEmailTrackingToken: token,
          emailWait: {
            trackingToken: token,
            deadlineAt: deadline,
            pollIntervalMs: 5 * 60 * 1000,
            branchOnTimeoutSteps: timeoutSteps as unknown[],
            branchMode: true,
            firstOutreachGate,
            alternateStepIndex: firstOutreachGate ? -1 : undefined,
            alternateSteps: hasAlternates
              ? stepCtx.alternateEngagementSteps
              : undefined,
            firstWaitMs: firstOutreachGate ? waitMs : undefined,
          },
        });
        if (!scheduledOpenWait) {
          results.push('Skipped: workflow already enrolled for this record');
          return false;
        }
        const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
        const formattedDeadline = deadline.toLocaleString('en-US', {
          timeZone: tz,
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        if (alreadyOpenedAtSchedule) {
          results.push(
            'Tracked outreach already opened — advancing open wait immediately',
          );
          this.nudgeDueDelayedJobsIfIdle();
        } else if (deferCadence && hasAlternates) {
          results.push(
            `Waiting for first outreach open until ${formattedDeadline} (alternates or follow-ups after open/deadline)`,
          );
        } else if (deferCadence) {
          results.push(
            `Waiting for first outreach open until ${formattedDeadline} (follow-ups start after open)`,
          );
        } else if (hasAlternates) {
          results.push(
            `Waiting for open until ${formattedDeadline} (alternate emails send if not opened)`,
          );
        } else {
          results.push(
            `Waiting for open until ${formattedDeadline}`,
          );
        }
        return true;
      }
      if (isDelayStep(step)) {
        const d = step as { days?: number; hours?: number; minutes?: number };
        const ms = delayMs(d);
        if (ms <= 0) {
          i++;
          continue;
        }
        const remaining = steps.slice(i + 1);
        const runAt = new Date(Date.now() + ms);
        const scheduledDelay = await this.persistPendingDelayedJob({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId: event.entityId,
          trigger: event.trigger,
          stepsRemaining: remaining as unknown[],
          userSnapshot: event.user as Record<string, unknown> | undefined,
          accumulatedResults: [...results],
          branchLabel,
          runAt,
          executionMode: 'branch',
          ctx: stepCtx,
          claimOnceEnrollment: claimOnce,
        });
        if (!scheduledDelay) {
          results.push('Skipped: workflow already enrolled for this record');
          return false;
        }
        results.push(`Scheduled delay → resume at ${runAt.toISOString()}`);
        return true;
      }
      if (isActionStep(step)) {
        const act = step.action;
        if (
          act.type === 'send_email_template' &&
          (act.sendJitterSecondsMax ?? 0) > 0
        ) {
          const maxJ = Math.min(
            3600,
            Math.max(0, Number(act.sendJitterSecondsMax) || 0),
          );
          const jitterSec = Math.floor(Math.random() * (maxJ + 1));
          const stripped = {
            ...act,
            sendJitterSecondsMax: 0,
          } as WorkflowAction;
          const remaining = [
            { type: 'action' as const, action: stripped },
            ...steps.slice(i + 1),
          ];
          const jitterRunAt = new Date(Date.now() + jitterSec * 1000);
          const scheduledJitter = await this.persistPendingDelayedJob({
            workflowId: wf._id,
            entityType: event.entityType,
            entityId: event.entityId,
            trigger: event.trigger,
            stepsRemaining: remaining as unknown[],
            userSnapshot: event.user as Record<string, unknown> | undefined,
            accumulatedResults: [...results],
            branchLabel,
            runAt: jitterRunAt,
            executionMode: 'branch',
            ctx: stepCtx,
            claimOnceEnrollment: claimOnce,
          });
          if (!scheduledJitter) {
            results.push('Skipped: workflow already enrolled for this record');
            return false;
          }
          results.push(
            `Email send delayed ${jitterSec}s (jitter) → ${jitterRunAt.toISOString()}`,
          );
          return true;
        }
        try {
          const r = await this.runAction(
            step.action,
            event,
            authorId,
            wf._id,
            stepCtx,
          );
          results.push(r);
          if (
            branchLabel === 'Follow-up sequence' &&
            event.entityType === 'Lead' &&
            step.action.type === 'send_email_template' &&
            /^Email sent/i.test(r)
          ) {
            const stepNum =
              this.leadEngagementAutomation.countFollowUpEmailsSent(results);
            void this.leadEngagementAutomation.onLeadFollowUpEmailSent(
              String(event.entityId),
              stepNum,
            );
          }
        } catch (e: any) {
          const reason = e?.message || String(e);
          throw new Error(
            `Step ${i + 1} (${String(act.type || 'action')}) failed: ${reason}`,
          );
        }
        i++;
        continue;
      }
      i++;
    }
    return false;
  }

  private resolveAuthorId(
    event: WorkflowDispatchEvent,
  ): Types.ObjectId | undefined {
    const u = event.user;
    const raw = u?.userId || u?._id;
    if (raw && Types.ObjectId.isValid(String(raw))) {
      return new Types.ObjectId(String(raw));
    }
    return undefined;
  }

  private splitKeyForAccounts(
    templateId: string,
    accountIds: string[],
  ): string {
    return createHash('sha256')
      .update(`${templateId}|${[...accountIds].sort().join(',')}`)
      .digest('hex')
      .slice(0, 32);
  }

  private stickyMailboxIndex(
    entityId: Types.ObjectId,
    workflowId: Types.ObjectId,
    templateId: string,
    accountIds: string[],
  ): number {
    const h = createHash('sha256')
      .update(
        `${workflowId}:${entityId}:${templateId}:${[...accountIds].sort().join(',')}`,
      )
      .digest();
    const n = h.readUInt32BE(0);
    return n % accountIds.length;
  }

  private async bumpRoundRobinSplit(
    workflowId: Types.ObjectId,
    key: string,
    modulo: number,
  ): Promise<number> {
    if (modulo <= 0) return 0;
    const doc = await this.splitCounterModel
      .findOneAndUpdate(
        { workflowId, key },
        { $inc: { counter: 1 } },
        { upsert: true, new: true },
      )
      .exec();
    const c = doc?.counter ?? 1;
    return (c - 1) % modulo;
  }

  private async resolveSendEmailAccountId(
    action: Extract<WorkflowAction, { type: 'send_email_template' }>,
    workflowId: Types.ObjectId | undefined,
    entityId: Types.ObjectId,
    userId: string,
    lockedInboxAccountId?: string,
  ): Promise<string | undefined> {
    const explicit = action.inboxAccountId?.trim();
    if (explicit && Types.ObjectId.isValid(explicit)) {
      return explicit;
    }
    if (
      lockedInboxAccountId &&
      Types.ObjectId.isValid(lockedInboxAccountId)
    ) {
      return lockedInboxAccountId;
    }
    const split = action.mailboxSplit;
    const rawIds = (split?.accountIds ?? []).filter((id) =>
      Types.ObjectId.isValid(String(id)),
    );
    const uniqueIds = [...new Set(rawIds.map((id) => String(id)))];
    let mode: WorkflowMailboxSplitMode | undefined = split?.mode;

    if (uniqueIds.length >= 2) {
      if (!mode) {
        mode = 'round_robin';
      }
      if (mode === 'sticky_entity') {
        if (!workflowId) {
          return uniqueIds[Math.floor(Math.random() * uniqueIds.length)];
        }
        const idx = this.stickyMailboxIndex(
          entityId,
          workflowId,
          action.templateId || '__ai_draft__',
          uniqueIds,
        );
        return uniqueIds[idx];
      }
      if (mode === 'random') {
        return uniqueIds[Math.floor(Math.random() * uniqueIds.length)];
      }
      if (mode === 'round_robin') {
        if (!workflowId) {
          return uniqueIds[Math.floor(Math.random() * uniqueIds.length)];
        }
        const key = this.splitKeyForAccounts(
          action.templateId || '__ai_draft__',
          uniqueIds,
        );
        const idx = await this.bumpRoundRobinSplit(
          workflowId,
          key,
          uniqueIds.length,
        );
        return uniqueIds[idx];
      }
    }
    if (uniqueIds.length === 1) {
      return uniqueIds[0];
    }
    let accountId = action.inboxAccountId;
    if (!accountId || !Types.ObjectId.isValid(accountId)) {
      accountId =
        (await this.inboxAccountsService.getPreferredSendAccountId(userId)) ??
        undefined;
    }
    return accountId;
  }

  private buildEmailRetryAccountOrder(
    primaryAccountId: string | undefined,
    action: Extract<WorkflowAction, { type: 'send_email_template' }>,
  ): string[] {
    const out: string[] = [];
    const push = (id: string | undefined) => {
      if (!id || !Types.ObjectId.isValid(id)) return;
      if (!out.includes(id)) out.push(id);
    };
    push(primaryAccountId);
    const fallbacks = Array.isArray(action.fallbackInboxAccountIds)
      ? action.fallbackInboxAccountIds
      : [];
    for (const id of fallbacks.map((x) => String(x || '').trim())) push(id);
    return out;
  }

  /** User id string for inbox send (required for send_email_template). */
  private resolveWorkflowUserId(event: WorkflowDispatchEvent): string | null {
    const u = event.user;
    const raw = u?.userId || u?._id;
    if (raw && Types.ObjectId.isValid(String(raw))) {
      return String(raw);
    }
    const cb = event.record?.createdBy;
    if (cb && Types.ObjectId.isValid(String(cb))) {
      return String(cb);
    }
    return null;
  }

  private entityTypeToModule(
    entityType: WorkflowEntityType,
  ): 'leads' | 'contacts' | 'organizations' {
    if (entityType === 'Lead') return 'leads';
    if (entityType === 'Contact') return 'contacts';
    return 'organizations';
  }

  /** Prefer workflow user; fall back to record creator so activities have an author when possible. */
  private resolveActivityAuthorId(
    event: WorkflowDispatchEvent,
  ): Types.ObjectId | undefined {
    const u = this.resolveAuthorId(event);
    if (u) return u;
    const cb = event.record?.createdBy;
    if (cb && Types.ObjectId.isValid(String(cb))) {
      return new Types.ObjectId(String(cb));
    }
    return undefined;
  }

  private async resolveWorkflowRecipientEmail(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
    record: Record<string, unknown>,
  ): Promise<string | null> {
    const direct = record.email != null ? String(record.email).trim() : '';
    if (direct) return direct;
    return null;
  }

  private async resolveAiDraftPersonTarget(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
    record: Record<string, unknown>,
  ): Promise<{ module: 'leads' | 'contacts'; entityId: string } | null> {
    if (entityType === 'Lead') {
      return { module: 'leads', entityId: String(entityId) };
    }
    if (entityType === 'Contact') {
      return { module: 'contacts', entityId: String(entityId) };
    }
    const assocRaw = record.associatedContacts;
    const assocIds = Array.isArray(assocRaw) ? assocRaw.map((x) => String(x)) : [];
    const firstAssoc = assocIds.find((x) => Types.ObjectId.isValid(x));
    if (firstAssoc) {
      return { module: 'contacts', entityId: firstAssoc };
    }
    const contact = await this.contactModel
      .findOne({
        $or: [
          { organization: { $in: [String(entityId), (record.name as string) || ''] } },
          { associatedOrganizations: new Types.ObjectId(String(entityId)) },
        ],
        email: { $exists: true, $ne: '' },
      })
      .select('_id')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (contact?._id) {
      return { module: 'contacts', entityId: String(contact._id) };
    }
    return null;
  }

  private async runAction(
    action: WorkflowAction,
    event: WorkflowDispatchEvent,
    authorId: Types.ObjectId | undefined,
    workflowId: Types.ObjectId | undefined,
    ctx: WorkflowRunContext | undefined,
  ): Promise<string> {
    const { entityType, entityId } = event;

    switch (action.type) {
      case 'set_property': {
        const field = String(action.field || '').trim();
        if (!field) throw new Error('Set property: missing field name');
        const patch = this.buildSetPropertyPatch(
          entityType,
          field,
          action.value,
        );
        await this.patchEntity(entityType, entityId, patch);
        const label =
          field.startsWith('customFields.') ?
            field.slice('customFields.'.length)
          : field;
        return `Set ${label} → ${String(action.value ?? '')}`;
      }
      case 'assign_owner': {
        if (entityType === 'Contact' || entityType === 'Organization') {
          return 'Assign owner skipped (use Set property for contacts/orgs)';
        }
        const patch: Record<string, unknown> = { leadOwner: action.ownerName };
        await this.patchEntity(entityType, entityId, patch);
        return `Owner → ${action.ownerName}`;
      }
      case 'create_task': {
        const due = new Date(
          Date.now() + Math.max(0, action.dueInDays ?? 0) * 86400000,
        );
        const calendarEnabled = action.calendarEnabled !== false;
        const reminderEnabled = action.reminderEnabled !== false;
        const reminderBeforeMinutes = Math.max(
          0,
          Number(action.reminderBeforeMinutes ?? 0),
        );
        const reminderAt = new Date(
          due.getTime() - reminderBeforeMinutes * 60_000,
        );
        const title = String(action.title ?? '').trim();
        const body =
          typeof action.body === 'string'
            ? action.body.trim()
            : action.body != null
              ? String(action.body).trim()
              : '';
        /** Timeline renders `content` for tasks, not `title` — combine so the description always shows. */
        const content =
          title && body
            ? `${title}\n\n${body}`
            : title || body || 'Workflow task';
        const taskAuthor = this.resolveActivityAuthorId(event);
        await new this.activityModel({
          type: 'Task',
          title: title || 'Workflow task',
          content,
          relatedTo: entityId,
          relatedType: entityType,
          author: taskAuthor,
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
                  reminderMessage: `Automated workflow task: ${title || content.slice(0, 60)}`,
                }
              : {}),
            remindersSent: [],
            workflowAutomation: true,
          },
        }).save();
        return `Task: ${title || content.slice(0, 60)}`;
      }
      case 'create_note': {
        const raw =
          typeof action.body === 'string'
            ? action.body
            : action.body != null
              ? String(action.body)
              : '';
        const content = raw.trim();
        const noteAuthor = this.resolveActivityAuthorId(event);
        const title = content
          ? content.split('\n')[0].slice(0, 120) || 'Workflow note'
          : 'Workflow note';
        await new this.activityModel({
          type: 'Note',
          title,
          content: content || '(empty note)',
          relatedTo: entityId,
          relatedType: entityType,
          author: noteAuthor,
        }).save();
        return 'Note created';
      }
      case 'notify_teams': {
        const toEmail = String(action.email || '').trim();
        if (!toEmail || !toEmail.includes('@')) {
          return 'Teams skipped: set recipient Microsoft 365 email on the action';
        }
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const path =
          entityType === 'Lead'
            ? 'leads'
            : entityType === 'Contact'
              ? 'contacts'
              : 'organizations';
        const link = action.link || `${frontendUrl}/crm/${path}/${entityId}`;
        const msg = String(action.message ?? '');
        const r = await this.teamsBotService.sendProactiveDM(
          toEmail,
          'CRM workflow',
          msg,
          link,
        );
        return r.success ? `Teams DM → ${toEmail}` : `Teams failed: ${r.error}`;
      }
      case 'http_webhook': {
        const method = action.method || 'POST';
        const payload = JSON.stringify({
          trigger: event.trigger,
          entityType,
          entityId: String(entityId),
          record: event.record,
        });
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(action.headers || {}),
        };
        if (method === 'GET') {
          const u = new URL(action.url);
          u.searchParams.set('payload', payload);
          const res = await fetch(u.toString(), { method: 'GET', headers });
          if (!res.ok) {
            throw new Error(`Webhook GET failed: HTTP ${res.status}`);
          }
          return `Webhook GET ${res.status}`;
        }
        const res = await fetch(action.url, {
          method: 'POST',
          headers,
          body: payload,
        });
        if (!res.ok) {
          throw new Error(`Webhook POST failed: HTTP ${res.status}`);
        }
        return `Webhook POST ${res.status}`;
      }
      case 'send_email_template': {
        const userId = this.resolveWorkflowUserId(event);
        if (!userId) {
          throw new Error(
            'No workflow user on event (workflows need a user with a connected mailbox; delays preserve the enrolling user)',
          );
        }
        if (ctx && ctx.cancelOnReply !== false) {
          const since = ctx.sequenceStartedAt || new Date(0);
          if (
            await this.hasInboundReplySince(
              entityType,
              entityId,
              since,
            )
          ) {
            throw new Error(
              'Cancelled: recipient replied before scheduled follow-up send',
            );
          }
        }
        const sendMode =
          action.sendMode === 'ai_draft'
            ? 'ai_draft'
            : action.sendMode === 'custom'
              ? 'custom'
              : 'template';
        const to = await this.resolveWorkflowRecipientEmail(
          entityType,
          entityId,
          event.record,
        );
        if (!to) {
          throw new Error('No recipient email (set email on record)');
        }
        let subject = '';
        let body = '';
        if (sendMode === 'ai_draft') {
          const aiTarget = await this.resolveAiDraftPersonTarget(
            entityType,
            entityId,
            event.record,
          );
          if (!aiTarget) {
            throw new Error(
              'AI draft mode could not resolve a lead/contact context for this record. Link a contact or lead first.',
            );
          }
          const draft = await this.crmAiService.draftAutomatedPersonOutreachEmail(
            aiTarget.module,
            aiTarget.entityId,
            action.aiInstructions?.trim() || undefined,
          );
          subject = draft.subject;
          body = draft.bodyHtml;
        } else if (sendMode === 'custom') {
          if (!action.subject?.trim() || !action.body?.trim()) {
            throw new Error('Custom email step is missing subject or body');
          }
          const merge = await this.emailTemplateMergeService.mergeForWorkflow(
            entityType,
            entityId,
            event.record,
            event.user
              ? {
                  firstName: event.user.firstName,
                  lastName: event.user.lastName,
                  email: event.user.email,
                }
              : undefined,
          );
          subject = this.emailTemplatesService.fillVariables(
            action.subject,
            merge,
          );
          body = this.emailTemplatesService.fillVariables(action.body, merge);
        } else {
          if (!action.templateId || !Types.ObjectId.isValid(action.templateId)) {
            throw new Error('Invalid template id');
          }
          const tpl = await this.emailTemplatesService.findOne(action.templateId);
          if (!tpl) {
            throw new Error('Template not found');
          }
          const merge = await this.emailTemplateMergeService.mergeForWorkflow(
            entityType,
            entityId,
            event.record,
            event.user
              ? {
                  firstName: event.user.firstName,
                  lastName: event.user.lastName,
                  email: event.user.email,
                }
              : undefined,
          );
          subject = this.emailTemplatesService.fillVariables(tpl.subject, merge);
          body = this.emailTemplatesService.fillVariables(tpl.body, merge);
        }
        const tplKey =
          sendMode === 'template' && action.templateId
            ? String(action.templateId)
            : sendMode === 'custom'
              ? `__custom__:${String(action.subject || '').slice(0, 40)}`
              : '__ai_draft__';
        if (ctx?.workflowDelayedJobId) {
          const existingJob = await this.delayedJobModel
            .findById(ctx.workflowDelayedJobId)
            .select('sendGuard')
            .lean()
            .exec();
          const guard = existingJob?.sendGuard as
            | { templateId?: string; trackingToken?: string }
            | undefined;
          if (guard?.trackingToken && guard.templateId === tplKey) {
            if (ctx) {
              ctx.lastEmailTrackingToken = guard.trackingToken;
            }
            return `Email already sent (recovered after restart) → ${to}`;
          }
        }
        const accountId = await this.resolveSendEmailAccountId(
          action,
          workflowId,
          entityId,
          userId,
          ctx?.lockedInboxAccountId,
        );
        const attemptOrder = this.buildEmailRetryAccountOrder(accountId, action);
        if (attemptOrder.length === 0) {
          throw new Error(
            'No connected mailbox for this user (CRM -> Inbox accounts)',
          );
        }
        const mod = this.entityTypeToModule(entityType);
        const enforce =
          action.enforceRecipientMatch !== false &&
          entityType !== 'Organization';
        const workflowMeta =
          ctx?.workflowDelayedJobId ||
          ctx?.followUpSequenceStepDtos?.length ||
          ctx?.cadenceStartsAfterOpen ||
          ctx?.alternateEngagementSteps?.length
            ? {
                followUpSequence: true as const,
                ...(workflowId ? { workflowId: String(workflowId) } : {}),
                ...(ctx?.alternateEngagementStepIndex != null
                  ? { alternateStep: ctx.alternateEngagementStepIndex }
                  : {}),
              }
            : undefined;
        // Same path as manual inbox send: pixel + link tracking via EmailTrackingService.
        const failures: string[] = [];
        let sentBy: string | null = null;
        let trackingToken: string | undefined;
        for (let ai = 0; ai < attemptOrder.length; ai++) {
          const aid = attemptOrder[ai];
          const r = await this.inboxAccountsService.sendFromAccount(
            userId,
            aid,
            {
              to,
              subject,
              body,
              module: mod,
              entityId: String(entityId),
              enforceCrmRecipient: enforce,
              templateId:
                sendMode === 'template' ? action.templateId : undefined,
              systemBypassAuth: true,
              workflowMeta,
            },
          );
          if (r.success) {
            sentBy = aid;
            trackingToken = r.trackingToken;
            break;
          }
          failures.push(`attempt ${ai + 1} (${aid}): ${r.error || 'send error'}`);
          if (!action.retryOnSendFail) break;
        }
        if (trackingToken && ctx) {
          ctx.lastEmailTrackingToken = trackingToken;
        }
        if (ctx?.workflowDelayedJobId && sentBy) {
          await this.delayedJobModel
            .updateOne(
              { _id: ctx.workflowDelayedJobId },
              {
                $set: {
                  sendGuard: {
                    templateId: tplKey,
                    sentAt: new Date(),
                    trackingToken,
                  },
                  ...(trackingToken
                    ? { lastEmailTrackingToken: trackingToken }
                    : {}),
                },
              },
            )
            .exec();
        }
        const splitNote =
          action.mailboxSplit?.accountIds &&
          action.mailboxSplit.accountIds.length >= 2
            ? ` (${action.mailboxSplit.mode})`
            : '';
        if (!sentBy) {
          throw new Error(
            failures.length
              ? `Send failed. ${failures.join(' ; ')}`
              : 'send error',
          );
        }
        const fromEmail =
          (await this.inboxAccountsService.getAccountEmailById(sentBy)) ||
          sentBy;
        const retried =
          action.retryOnSendFail && failures.length > 0
            ? ` after ${failures.length} retry`
            : '';
        const modeLabel =
          sendMode === 'ai_draft'
            ? 'ai draft'
            : sendMode === 'custom'
              ? 'custom'
              : 'template';
        return `Email sent (${modeLabel}) from ${fromEmail} → ${to}: "${subject}"${splitNote}${retried}`;
      }
      default:
        return 'Unknown action';
    }
  }

  private entityMatchesWorkflowTrigger(
    trigger: WorkflowTrigger,
    entityType: WorkflowEntityType,
  ): boolean {
    const lead: WorkflowTrigger[] = [
      'lead_created',
      'lead_updated',
      'lead_stage_changed',
      'lead_pipeline_changed',
      'lead_status_changed',
      'lead_owner_changed',
      'lead_tracked_email_opened',
      'lead_tracked_email_replied',
    ];
    const contact: WorkflowTrigger[] = [
      'contact_created',
      'contact_updated',
      'contact_email_changed',
      'contact_tracked_email_opened',
      'contact_tracked_email_replied',
    ];
    const org: WorkflowTrigger[] = [
      'organization_created',
      'organization_updated',
      'organization_name_changed',
      'organization_tracked_email_opened',
      'organization_tracked_email_replied',
    ];
    if (entityType === 'Lead') return lead.includes(trigger);
    if (entityType === 'Contact') return contact.includes(trigger);
    if (entityType === 'Organization') return org.includes(trigger);
    return false;
  }

  private workflowMatchesEntity(
    wf: Workflow & { trigger: WorkflowTrigger; triggers?: WorkflowTrigger[] },
    entityType: WorkflowEntityType,
  ): boolean {
    const all = [wf.trigger, ...((wf.triggers || []) as WorkflowTrigger[])];
    return all.some((t) => this.entityMatchesWorkflowTrigger(t, entityType));
  }

  private async evaluateGoalsForRecord(
    event: WorkflowDispatchEvent,
  ): Promise<void> {
    const wfs = await this.workflowModel
      .find({ enabled: true, 'goal.enabled': true })
      .lean()
      .exec();
    for (const wf of wfs) {
      if (
        !this.workflowMatchesEntity(
          wf as Workflow & { trigger: WorkflowTrigger; triggers?: WorkflowTrigger[] },
          event.entityType,
        )
      )
        continue;
      const goal = wf.goal as
        | { enabled?: boolean; label?: string; filters?: WorkflowFilter[] }
        | undefined;
      if (!goal?.filters?.length) continue;
      const ok = (await this.passesFiltersAsync(goal.filters, event)).ok;
      if (!ok) continue;
      try {
        await this.goalHitModel.create({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId: event.entityId,
          label: goal.label,
          trigger: event.trigger,
        });
      } catch (e: any) {
        if (e?.code !== 11000)
          this.logger.warn(`[Workflows] goal hit: ${e?.message || e}`);
      }
    }
  }

  private async runCanvasWorkflow(
    wf: Workflow & { _id: Types.ObjectId },
    event: WorkflowDispatchEvent,
  ): Promise<void> {
    const entityId = event.entityId;
    const once = enrollmentOnce(wf);

    if (once) {
      const existing = await this.enrollmentModel
        .findOne({ workflowId: wf._id, entityType: event.entityType, entityId })
        .exec();
      if (existing) {
        await this.logExecution({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId,
          trigger: event.trigger,
          status: 'skipped',
          skipReason: 'Enrollment: already ran once for this record',
          actionResults: [],
        });
        return;
      }
    }

    const graph = wf.canvasGraph as WorkflowCanvasGraph;
    if (!graph?.nodes?.length) {
      await this.logExecution({
        workflowId: wf._id,
        entityType: event.entityType,
        entityId,
        trigger: event.trigger,
        status: 'skipped',
        skipReason: 'Canvas has no nodes',
        actionResults: [],
      });
      return;
    }

    const results: string[] = [];
    const authorId = this.resolveAuthorId(event);

    const ctx = this.initRunContext(wf as Workflow);
    try {
      const { scheduled, finalVariant } = await this.executeCanvasTraversal(
        wf,
        event,
        graph,
        results,
        authorId,
        WORKFLOW_CANVAS_START_ID,
        undefined,
        ctx,
      );
      if (scheduled) {
        await this.logWorkflowScheduleToTimeline({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId,
          trigger: event.trigger,
          branchLabel: 'Canvas',
          actionResults: results,
          event,
        });
        return;
      }

      if (once) {
        try {
          await this.enrollmentModel.create({
            workflowId: wf._id,
            entityType: event.entityType,
            entityId,
          });
        } catch (e: any) {
          if (e?.code !== 11000) throw e;
        }
      }

      await this.logExecution({
        workflowId: wf._id,
        entityType: event.entityType,
        entityId,
        trigger: event.trigger,
        status: 'success',
        actionResults: results,
        branchLabel: 'Canvas',
        variant: finalVariant,
      });
    } catch (err: any) {
      await this.logExecution({
        workflowId: wf._id,
        entityType: event.entityType,
        entityId,
        trigger: event.trigger,
        status: 'failed',
        actionResults: results,
        errorMessage: err?.message || String(err),
        branchLabel: 'Canvas',
      });
    }
  }

  private async executeCanvasTraversal(
    wf: Workflow & { _id: Types.ObjectId },
    event: WorkflowDispatchEvent,
    graph: WorkflowCanvasGraph,
    results: string[],
    authorId: Types.ObjectId | undefined,
    startNodeId: string,
    inheritedVariant: 'A' | 'B' | undefined,
    ctx: WorkflowRunContext,
  ): Promise<{ scheduled: boolean; finalVariant?: 'A' | 'B' }> {
    const claimOnce = enrollmentOnce(wf);
    let currentId = startNodeId;
    let variant = inheritedVariant;

    for (let guard = 0; guard < 500; guard++) {
      if (currentId === WORKFLOW_CANVAS_START_ID) {
        const outs = outgoingEdges(graph, WORKFLOW_CANVAS_START_ID).sort(
          (a, b) => a.id.localeCompare(b.id),
        );
        if (!outs.length) return { scheduled: false, finalVariant: variant };
        currentId = outs[0].target;
        continue;
      }

      if (currentId === WORKFLOW_EMAIL_WAIT_OPEN_END_ID) {
        results.push(
          'Email opened — only a No (timeout) branch was configured; workflow completed.',
        );
        return { scheduled: false, finalVariant: variant };
      }

      const nodeMap = buildNodeMap(graph);
      const node = nodeMap.get(currentId);
      if (!node) return { scheduled: false, finalVariant: variant };

      if (node.type === 'wf_action') {
        const action = node.action as WorkflowAction;
        if (
          action.type === 'send_email_template' &&
          (action.sendJitterSecondsMax ?? 0) > 0
        ) {
          const maxJ = Math.min(
            3600,
            Math.max(0, Number(action.sendJitterSecondsMax) || 0),
          );
          const jitterSec = Math.floor(Math.random() * (maxJ + 1));
          const next = pickEdge(outgoingEdges(graph, currentId), 'default');
          if (!next) return { scheduled: false, finalVariant: variant };
          const stripped = {
            ...action,
            sendJitterSecondsMax: 0,
          } as WorkflowAction;
          const scheduledJitter = await this.persistPendingDelayedJob({
            workflowId: wf._id,
            entityType: event.entityType,
            entityId: event.entityId,
            trigger: event.trigger,
            stepsRemaining: [],
            userSnapshot: event.user as Record<string, unknown> | undefined,
            accumulatedResults: [...results],
            branchLabel: 'Canvas',
            runAt: new Date(Date.now() + jitterSec * 1000),
            executionMode: 'canvas',
            ctx,
            claimOnceEnrollment: claimOnce,
            canvasNextNodeId: next.target,
            canvasGraphSnapshot: graph,
            abVariant: variant,
            pendingCanvasEmailAction: stripped as unknown as Record<
              string,
              unknown
            >,
            ...(ctx.lastEmailTrackingToken
              ? { lastEmailTrackingToken: ctx.lastEmailTrackingToken }
              : {}),
          });
          if (!scheduledJitter) {
            results.push('Skipped: workflow already enrolled for this record');
            return { scheduled: false, finalVariant: variant };
          }
          results.push(
            `Canvas email jitter ${jitterSec}s → ${new Date(Date.now() + jitterSec * 1000).toISOString()}`,
          );
          return { scheduled: true, finalVariant: variant };
        }
        const r = await this.runAction(action, event, authorId, wf._id, ctx);
        results.push(r);
        const next = pickEdge(outgoingEdges(graph, currentId), 'default');
        if (!next) return { scheduled: false, finalVariant: variant };
        currentId = next.target;
        continue;
      }

      if (node.type === 'wf_wait_email_engagement') {
        let token = ctx.lastEmailTrackingToken;
        if (!token) {
          const since = new Date(Date.now() - 72 * 3600000);
          const fb =
            await this.emailTrackingService.findLatestTrackingTokenForEntity(
              String(event.entityId),
              since,
            );
          if (fb) {
            token = fb;
            ctx.lastEmailTrackingToken = fb;
            results.push(
              'Email open wait: linked to latest tracked send for this record (restore after delay)',
            );
          }
        }
        const nWait = node as {
          waitTotalMinutes?: number;
          waitHours?: number;
          pollMinutes?: number;
        };
        const rawTotal = Number(nWait.waitTotalMinutes);
        const rawHours = Number(nWait.waitHours);
        let totalWaitMinutes: number;
        if (Number.isFinite(rawTotal) && rawTotal > 0) {
          totalWaitMinutes = rawTotal;
        } else if (Number.isFinite(rawHours) && rawHours > 0) {
          totalWaitMinutes = rawHours * 60;
        } else {
          totalWaitMinutes = 48 * 60;
        }
        totalWaitMinutes = Math.min(7 * 24 * 60, Math.max(1, totalWaitMinutes));
        const pollMin = Math.min(
          120,
          Math.max(
            1,
            Number(nWait.pollMinutes) || 5,
          ),
        );
        const outsWait = outgoingEdges(graph, currentId);
        const resolved = resolveWaitEmailOutgoingEdges(outsWait);
        let onOpenNodeId: string;
        let onTimeoutNodeId: string | undefined;
        if (resolved?.mode === 'timeout_only') {
          onTimeoutNodeId = resolved.timeoutEdge.target;
          onOpenNodeId = WORKFLOW_EMAIL_WAIT_OPEN_END_ID;
          results.push(
            'Email open wait: only No (timeout) branch connected — if opened, workflow ends without a Yes follow-up.',
          );
        } else if (resolved?.mode === 'both') {
          onTimeoutNodeId = resolved.timeoutEdge.target;
          onOpenNodeId = resolved.openedEdge.target;
          const legacyBothDefault =
            outsWait.length === 2 &&
            outsWait.every((e) => !e.branch || e.branch === 'default');
          if (legacyBothDefault) {
            results.push(
              'Email open wait: unlabeled branches — using sorted edge order (Yes then No). Re-connect from the green Yes and red No handles to label explicitly.',
            );
          } else if (
            outsWait.length === 2 &&
            outsWait.some((e) => !e.branch || e.branch === 'default') &&
            outsWait.some((e) => e.branch === 'yes' || e.branch === 'no')
          ) {
            results.push(
              'Email open wait: one branch was unlabeled — treated as the missing Yes/No.',
            );
          }
        } else if (
          outsWait.length === 1 &&
          (outsWait[0].branch || 'default') === 'yes'
        ) {
          onOpenNodeId = outsWait[0].target;
          onTimeoutNodeId = WORKFLOW_EMAIL_WAIT_OPEN_END_ID;
          results.push(
            'Email open wait: only Yes (opened) branch connected — if not opened by timeout, workflow ends.',
          );
        } else {
          results.push(
            'Email open wait skipped: connect green Yes, red No, or both handles.',
          );
          return { scheduled: false, finalVariant: variant };
        }
        if (!onTimeoutNodeId) {
          results.push(
            'Email open wait skipped: connect the red No (timeout) handle for the not-opened follow-up',
          );
          return { scheduled: false, finalVariant: variant };
        }
        if (!token) {
          results.push(
            'Email open wait: no tracked send yet — taking No branch',
          );
          currentId = onTimeoutNodeId;
          continue;
        }
        const deadline = new Date(Date.now() + totalWaitMinutes * 60 * 1000);
        const trkAtSchedule = await this.emailTrackingService.findByToken(token);
        const alreadyOpenedAtSchedule = !!(
          trkAtSchedule?.lastOpenedAt ||
          (Number(trkAtSchedule?.openCount) || 0) > 0
        );
        const firstPollMs = alreadyOpenedAtSchedule
          ? 0
          : Math.min(
              pollMin * 60 * 1000,
              Math.max(5000, deadline.getTime() - Date.now()),
            );
        const scheduledEmailWait = await this.persistPendingDelayedJob({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId: event.entityId,
          trigger: event.trigger,
          stepsRemaining: [],
          userSnapshot: event.user as Record<string, unknown> | undefined,
          accumulatedResults: [...results],
          branchLabel: 'Canvas',
          runAt: new Date(Date.now() + firstPollMs),
          executionMode: 'canvas',
          ctx,
          claimOnceEnrollment: claimOnce,
          canvasGraphSnapshot: graph,
          abVariant: variant,
          lastEmailTrackingToken: token,
          emailWait: {
            trackingToken: token,
            deadlineAt: deadline,
            pollIntervalMs: pollMin * 60 * 1000,
            onOpenNodeId,
            onTimeoutNodeId,
          },
        });
        if (!scheduledEmailWait) {
          results.push('Skipped: workflow already enrolled for this record');
          return { scheduled: false, finalVariant: variant };
        }
        const waitLabel =
          totalWaitMinutes >= 60 && totalWaitMinutes % 60 === 0
            ? `${totalWaitMinutes / 60}h`
            : `${totalWaitMinutes}m`;
        if (alreadyOpenedAtSchedule) {
          results.push(
            'Email open wait: tracked send already opened — advancing immediately',
          );
          this.nudgeDueDelayedJobsIfIdle();
        } else {
          results.push(
            `Wait for email open (poll ~${pollMin}m, up to ${waitLabel}) → deadline ${deadline.toISOString()}`,
          );
        }
        return { scheduled: true, finalVariant: variant };
      }

      if (node.type === 'wf_delay') {
        const ms = delayMs({
          days: node.days,
          hours: node.hours,
          minutes: node.minutes,
        });
        const next = pickEdge(outgoingEdges(graph, currentId), 'default');
        if (!next) return { scheduled: false, finalVariant: variant };
        if (ms <= 0) {
          currentId = next.target;
          continue;
        }
        const runAt = new Date(Date.now() + ms);
        const scheduledCanvasDelay = await this.persistPendingDelayedJob({
          workflowId: wf._id,
          entityType: event.entityType,
          entityId: event.entityId,
          trigger: event.trigger,
          stepsRemaining: [],
          userSnapshot: event.user as Record<string, unknown> | undefined,
          accumulatedResults: [...results],
          branchLabel: 'Canvas',
          runAt,
          executionMode: 'canvas',
          ctx,
          claimOnceEnrollment: claimOnce,
          canvasNextNodeId: next.target,
          canvasGraphSnapshot: graph,
          abVariant: variant,
          ...(ctx.lastEmailTrackingToken
            ? { lastEmailTrackingToken: ctx.lastEmailTrackingToken }
            : {}),
        });
        if (!scheduledCanvasDelay) {
          results.push('Skipped: workflow already enrolled for this record');
          return { scheduled: false, finalVariant: variant };
        }
        results.push(`Canvas delay → resume at ${runAt.toISOString()}`);
        return { scheduled: true, finalVariant: variant };
      }

      if (node.type === 'wf_condition') {
        const fl = (node.filters || []) as WorkflowFilter[];
        const ok = (await this.passesFiltersAsync(fl, event)).ok;
        const next = pickEdge(
          outgoingEdges(graph, currentId),
          ok ? 'yes' : 'no',
        );
        if (!next) return { scheduled: false, finalVariant: variant };
        currentId = next.target;
        continue;
      }

      if (node.type === 'wf_ab_split') {
        const v = pickAbVariant(
          event.entityId,
          wf._id,
          node.splitPercentA ?? 50,
        );
        variant = v;
        const next = pickEdge(
          outgoingEdges(graph, currentId),
          v === 'A' ? 'a' : 'b',
        );
        if (!next) return { scheduled: false, finalVariant: variant };
        currentId = next.target;
        continue;
      }

      return { scheduled: false, finalVariant: variant };
    }

    return { scheduled: false, finalVariant: variant };
  }

  private async resumeCanvasDelayedJob(
    job: WorkflowDelayedJobDocument,
    wf: Workflow & { _id: Types.ObjectId },
    event: WorkflowDispatchEvent,
    ctx: WorkflowRunContext,
  ): Promise<void> {
    const graph = job.canvasGraphSnapshot as WorkflowCanvasGraph;
    const results = [...(job.accumulatedResults || [])];
    const authorId = this.resolveAuthorId(event);
    const startId = job.canvasNextNodeId!;
    const inherited = job.abVariant;

    if (job.pendingCanvasEmailAction) {
      const pa = job.pendingCanvasEmailAction as WorkflowAction;
      const r = await this.runAction(pa, event, authorId, wf._id, ctx);
      results.push(r);
    }

    const { scheduled, finalVariant } = await this.executeCanvasTraversal(
      wf,
      event,
      graph,
      results,
      authorId,
      startId,
      inherited,
      ctx,
    );

    if (scheduled) return;

    if (enrollmentOnce(wf as Workflow)) {
      try {
        await this.enrollmentModel.create({
          workflowId: wf._id,
          entityType: job.entityType,
          entityId: job.entityId,
        });
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
      }
    }

    await this.logExecution({
      workflowId: wf._id,
      entityType: job.entityType,
      entityId: job.entityId,
      trigger: job.trigger,
      status: 'success',
      actionResults: results,
      branchLabel: 'Canvas',
      hadScheduledDelay: true,
      variant: finalVariant,
    });
  }

  private buildSetPropertyPatch(
    entityType: WorkflowEntityType,
    field: string,
    rawValue: string | number | boolean,
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    let value: unknown = rawValue;
    if (field === 'pipeline') {
      const id = String(rawValue ?? '').trim();
      if (!Types.ObjectId.isValid(id)) {
        throw new Error('Set property: invalid pipeline id');
      }
      value = new Types.ObjectId(id);
    } else if (field === 'annualRevenue' || field === 'noOfEmployees') {
      const n = Number(rawValue);
      value = Number.isFinite(n) ? n : rawValue;
    }
    patch[field] = value;
    if (
      entityType === 'Lead' &&
      field === 'stage' &&
      value != null &&
      String(value).trim()
    ) {
      patch.status = value;
    }
    return patch;
  }

  private async patchEntity(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (entityType === 'Lead') {
      await this.leadModel
        .findByIdAndUpdate(entityId, { $set: patch }, { new: true })
        .exec();
      return;
    }
    if (entityType === 'Contact') {
      await this.contactModel
        .findByIdAndUpdate(entityId, { $set: patch }, { new: true })
        .exec();
      return;
    }
    await this.organizationModel
      .findByIdAndUpdate(entityId, { $set: patch }, { new: true })
      .exec();
  }

  /** Apply patch and fire stage/pipeline/owner follow-up triggers for chained workflows. */
  private async patchEntityWithDispatch(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
    patch: Record<string, unknown>,
    event: WorkflowDispatchEvent,
  ): Promise<void> {
    const previous =
      event.previous ??
      (event.record as Record<string, unknown> | null | undefined) ??
      (await this.fetchEntityRecord(entityType, entityId));
    await this.patchEntity(entityType, entityId, patch);
    const record = await this.fetchEntityRecord(entityType, entityId);
    if (!record) return;

    const prev = previous ?? null;
    const user = event.user;

    if (entityType === 'Lead') {
      void this.dispatch({
        trigger: 'lead_updated',
        entityType: 'Lead',
        entityId,
        record,
        previous: prev,
        user,
      });
      if (patch.stage !== undefined) {
        const oldStage = (prev as Record<string, unknown> | null)?.stage;
        const newStage = (record as Record<string, unknown>).stage;
        if (this.strId(oldStage) !== this.strId(newStage)) {
          void this.dispatch({
            trigger: 'lead_stage_changed',
            entityType: 'Lead',
            entityId,
            record,
            previous: prev,
            user,
          });
        }
      }
      if (patch.pipeline !== undefined) {
        const oldPipe = (prev as Record<string, unknown> | null)?.pipeline;
        const newPipe = (record as Record<string, unknown>).pipeline;
        if (this.strId(oldPipe) !== this.strId(newPipe)) {
          void this.dispatch({
            trigger: 'lead_pipeline_changed',
            entityType: 'Lead',
            entityId,
            record,
            previous: prev,
            user,
          });
        }
      }
      if (patch.status !== undefined) {
        const oldStatus = (prev as Record<string, unknown> | null)?.status;
        const newStatus = (record as Record<string, unknown>).status;
        if (this.strId(oldStatus) !== this.strId(newStatus)) {
          void this.dispatch({
            trigger: 'lead_status_changed',
            entityType: 'Lead',
            entityId,
            record,
            previous: prev,
            user,
          });
        }
      }
      if (patch.leadOwner !== undefined) {
        const oldOwner = (prev as Record<string, unknown> | null)?.leadOwner;
        const newOwner = (record as Record<string, unknown>).leadOwner;
        if (String(oldOwner ?? '') !== String(newOwner ?? '')) {
          void this.dispatch({
            trigger: 'lead_owner_changed',
            entityType: 'Lead',
            entityId,
            record,
            previous: prev,
            user,
          });
        }
      }
      return;
    }
  }

  private async logExecution(p: {
    workflowId: Types.ObjectId;
    entityType: WorkflowEntityType;
    entityId: Types.ObjectId;
    trigger: WorkflowTrigger;
    status: 'success' | 'skipped' | 'failed';
    skipReason?: string;
    actionResults: string[];
    errorMessage?: string;
    branchLabel?: string;
    hadScheduledDelay?: boolean;
    variant?: 'A' | 'B';
    goalMet?: boolean;
  }): Promise<void> {
    await this.executionModel.create(p);
    await this.logExecutionToTimeline(p);
  }

  private formatTimelineDateTime(value: string | Date | null | undefined): string {
    if (!value) return '';
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  private humanizeWorkflowTimelineLine(line: string): string {
    const isoLike =
      /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z\b/g;
    return String(line || '').replace(isoLike, (match) =>
      this.formatTimelineDateTime(match),
    );
  }

  /**
   * Mirror workflow run outcomes onto CRM record timeline so reps can inspect what happened
   * directly inside Lead/Contact/Organization detail pages.
   */
  /**
   * Log scheduled follow-up / workflow delay steps on the record timeline (workspace + detail).
   */
  private async logWorkflowScheduleToTimeline(p: {
    workflowId: Types.ObjectId;
    entityType: WorkflowEntityType;
    entityId: Types.ObjectId;
    trigger: WorkflowTrigger;
    branchLabel?: string;
    actionResults?: string[];
    event?: WorkflowDispatchEvent;
  }): Promise<void> {
    const wf = await this.workflowModel
      .findById(p.workflowId)
      .select('name')
      .lean()
      .exec();
    const wfName = String((wf as { name?: string } | null)?.name || 'Workflow');
    const isFollowUp =
      wfName === SYSTEM_FOLLOW_UP_WORKFLOW_NAME ||
      p.branchLabel === 'Follow-up sequence';

    const schedule = await this.getFollowUpScheduleForEntity(
      p.entityType,
      String(p.entityId),
    );

    const details: string[] = [];
    details.push(`Trigger: ${p.trigger}`);
    if (p.branchLabel) details.push(`Branch: ${p.branchLabel}`);
    if (p.actionResults?.length) {
      details.push('Progress:');
      for (const r of p.actionResults.slice(-10)) {
        details.push(`- ${this.humanizeWorkflowTimelineLine(r)}`);
      }
    }
    const tz = process.env.CRM_REPORTING_TIMEZONE || 'Asia/Kolkata';
    if (schedule.steps.length) {
      details.push('Scheduled follow-ups:');
      for (const s of schedule.steps) {
        const when = new Date(s.scheduledAt).toLocaleString('en-US', {
          timeZone: tz,
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        if (s.kind === 'wait') {
          details.push(`- ${when}: ${s.label}`);
        } else if (s.kind === 'email') {
          const label = s.templateName || s.label || 'Email template';
          details.push(`- ${when}: Send email · ${label}`);
        } else {
          details.push(`- ${when}: Create task · ${s.label}`);
        }
      }
      if (schedule.cancelOnReply) {
        details.push('Sequence stops if the recipient replies.');
      }
    } else if (schedule.nextScheduledAt) {
      details.push(
        `Next step: ${new Date(schedule.nextScheduledAt).toLocaleString('en-US', {
          timeZone: tz,
          dateStyle: 'medium',
          timeStyle: 'short',
        })}`,
      );
    }

    const headline = isFollowUp
      ? 'Follow-up sequence scheduled'
      : `Workflow scheduled: ${wfName}`;

    const author = p.event
      ? this.resolveActivityAuthorId(p.event)
      : undefined;

    await new this.activityModel({
      type: 'Activity',
      title: headline,
      content: details.join('\n'),
      relatedTo: p.entityId,
      relatedType: p.entityType,
      ...(author ? { author } : {}),
      metadata: {
        workflowExecution: true,
        workflowScheduled: true,
        followUpSequence: isFollowUp,
        workflowId: String(p.workflowId),
        status: 'scheduled',
        trigger: p.trigger,
        branchLabel: p.branchLabel,
        pendingJobCount: schedule.pendingJobCount,
        nextScheduledAt: schedule.nextScheduledAt,
        scheduledStepCount: schedule.steps.length,
      },
    }).save();
  }

  private async logFollowUpCancelledToTimeline(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
    reason: string,
    cancelledCount: number,
  ): Promise<void> {
    const details = [
      `Cancelled ${cancelledCount} pending step${cancelledCount === 1 ? '' : 's'}.`,
      `Reason: ${reason}`,
    ];
    await new this.activityModel({
      type: 'Activity',
      title: 'Follow-up sequence cancelled',
      content: details.join('\n'),
      relatedTo: entityId,
      relatedType: entityType,
      metadata: {
        workflowExecution: true,
        followUpSequence: true,
        workflowCancelled: true,
        cancelReason: reason,
        cancelledJobCount: cancelledCount,
      },
    }).save();
  }

  private async logExecutionToTimeline(p: {
    workflowId: Types.ObjectId;
    entityType: WorkflowEntityType;
    entityId: Types.ObjectId;
    trigger: WorkflowTrigger;
    status: 'success' | 'skipped' | 'failed';
    skipReason?: string;
    actionResults: string[];
    errorMessage?: string;
    branchLabel?: string;
    hadScheduledDelay?: boolean;
    variant?: 'A' | 'B';
    goalMet?: boolean;
  }): Promise<void> {
    if (p.status === 'skipped') {
      if (!p.hadScheduledDelay && !p.skipReason) return;
      const wf = await this.workflowModel
        .findById(p.workflowId)
        .select('name')
        .lean()
        .exec();
      const wfName = String((wf as { name?: string } | null)?.name || 'Workflow');
      const isFollowUp =
        wfName === SYSTEM_FOLLOW_UP_WORKFLOW_NAME ||
        p.branchLabel === 'Follow-up sequence';
      if (!isFollowUp && !p.hadScheduledDelay) return;

      const details: string[] = [
        `Trigger: ${p.trigger}`,
        p.skipReason ? `Reason: ${p.skipReason}` : 'Run skipped',
      ];
      if (p.actionResults?.length) {
        details.push('Steps:');
        for (const r of p.actionResults.slice(-6)) {
          details.push(`- ${this.humanizeWorkflowTimelineLine(r)}`);
        }
      }

      await new this.activityModel({
        type: 'Activity',
        title: isFollowUp
          ? 'Follow-up sequence stopped'
          : `Workflow skipped: ${wfName}`,
        content: details.join('\n'),
        relatedTo: p.entityId,
        relatedType: p.entityType,
        metadata: {
          workflowExecution: true,
          followUpSequence: isFollowUp,
          workflowId: String(p.workflowId),
          status: 'skipped',
          trigger: p.trigger,
          branchLabel: p.branchLabel,
          skipReason: p.skipReason,
        },
      }).save();
      return;
    }

    const wf = await this.workflowModel
      .findById(p.workflowId)
      .select('name')
      .lean()
      .exec();
    const wfName = String((wf as { name?: string } | null)?.name || 'Workflow');
    const isFollowUp =
      wfName === SYSTEM_FOLLOW_UP_WORKFLOW_NAME ||
      p.branchLabel === 'Follow-up sequence';
    const emailSendLines = (p.actionResults || []).filter((r) =>
      /^Email sent/i.test(String(r)),
    );
    const state = p.status === 'success' ? 'completed' : 'failed';
    let headline = `Workflow ${state}: ${wfName}`;
    if (isFollowUp) {
      if (emailSendLines.length > 0) {
        headline =
          p.status === 'failed'
            ? 'Follow-up sequence: email send failed'
            : 'Follow-up sequence: email sent';
      } else if (p.hadScheduledDelay) {
        headline =
          p.status === 'failed'
            ? 'Follow-up sequence update (failed)'
            : 'Follow-up sequence update';
      } else {
        headline =
          p.status === 'failed'
            ? 'Follow-up sequence failed'
            : 'Follow-up sequence completed';
      }
    }
    const details: string[] = [];
    details.push(`Trigger: ${p.trigger}`);
    if (p.branchLabel) details.push(`Branch: ${p.branchLabel}`);
    if (p.variant) details.push(`Variant: ${p.variant}`);
    if (p.hadScheduledDelay) details.push('Includes delay/wait');
    if (p.errorMessage) details.push(`Error: ${p.errorMessage}`);
    if (emailSendLines.length > 0) {
      details.push('Email sends (see Email entries on timeline for full message):');
      for (const r of emailSendLines.slice(-4)) {
        details.push(`- ${this.humanizeWorkflowTimelineLine(r)}`);
      }
    }
    if (p.actionResults?.length) {
      details.push('Progress:');
      for (const r of p.actionResults.slice(-8)) {
        details.push(`- ${this.humanizeWorkflowTimelineLine(r)}`);
      }
    }

    await new this.activityModel({
      type: 'Activity',
      title: headline,
      content: details.join('\n'),
      relatedTo: p.entityId,
      relatedType: p.entityType,
      metadata: {
        workflowExecution: true,
        followUpSequence: isFollowUp,
        workflowId: String(p.workflowId),
        status: p.status,
        trigger: p.trigger,
        branchLabel: p.branchLabel,
        variant: p.variant,
        goalMet: p.goalMet,
        ...(emailSendLines.length
          ? { workflowEmailSent: true, emailSendCount: emailSendLines.length }
          : {}),
      },
    }).save();
  }

  /** True if any active workflow spreads sends with jitter (deliverability checklist). */
  async hasActiveSendJitter(): Promise<boolean> {
    const hit = await this.workflowModel
      .exists({
        isActive: true,
        actions: { $elemMatch: { sendJitterSecondsMax: { $gt: 0 } } },
      })
      .lean()
      .exec();
    return !!hit;
  }
}
