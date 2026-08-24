import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { WorkflowTrigger } from './workflow.schema';

export type WorkflowDelayedJobDocument = WorkflowDelayedJob & Document;

export type WorkflowEntityType = 'Lead' | 'Contact' | 'Organization';

@Schema({ timestamps: true })
export class WorkflowDelayedJob {
  @Prop({ type: Types.ObjectId, ref: 'Workflow', required: true })
  workflowId: Types.ObjectId;

  @Prop({ required: true, enum: ['Lead', 'Contact', 'Organization'] })
  entityType: WorkflowEntityType;

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ required: true })
  trigger: WorkflowTrigger;

  @Prop({ type: [Object], required: true })
  stepsRemaining: unknown[];

  /** Follow-up cadence DTOs — delays computed when outreach is opened (not at schedule click). */
  @Prop({ type: [Object] })
  followUpCadenceSteps?: unknown[];

  /**
   * Snapshot of open-tracking alternate steps at enrollment (redundant with emailWait.alternateSteps).
   * Ensures alternates still run after deploy/restart even if emailWait is partially cleared.
   */
  @Prop({ type: [Object] })
  engagementAlternateSteps?: unknown[];

  @Prop({ type: Object })
  userSnapshot?: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  accumulatedResults: string[];

  @Prop()
  branchLabel?: string;

  /**
   * Absolute UTC time when this job should run (persisted in MongoDB — survives deploy/restart).
   * The cron worker claims rows where status=pending and runAt <= now.
   */
  @Prop({ required: true })
  runAt: Date;

  @Prop({
    enum: ['pending', 'processing', 'done', 'failed', 'cancelled'],
    default: 'pending',
  })
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

  @Prop()
  errorMessage?: string;

  /**
   * Set when auto-recovery must not re-scan this row (permanent send failure or cap hit).
   * Keeps maintenance cron from re-querying the same failed follow-up every tick.
   */
  @Prop()
  autoRecoveryBlockedAt?: Date;

  /** When the follow-up sequence started (used to detect replies before next send). */
  @Prop()
  sequenceStartedAt?: Date;

  /** Cancel remaining sends if recipient replies (inherits from workflow when unset). */
  @Prop()
  cancelOnReply?: boolean;

  @Prop()
  cancelReason?: string;

  /**
   * Prevents duplicate email if API restarts while status was `processing`.
   * Set after a successful workflow send for this job row.
   */
  @Prop({ type: Object })
  sendGuard?: {
    templateId?: string;
    sentAt?: Date;
    trackingToken?: string;
  };

  /** Follow-up sequences: lock sends to this mailbox (same as prior outbound). */
  @Prop({ type: Types.ObjectId, ref: 'UserEmailAccount' })
  lockedInboxAccountId?: Types.ObjectId;

  /** `branch` = legacy step list; `canvas` = resume at `canvasNextNodeId`. */
  @Prop({ enum: ['branch', 'canvas'], default: 'branch' })
  executionMode?: 'branch' | 'canvas';

  @Prop()
  canvasNextNodeId?: string;

  @Prop({ type: Object })
  canvasGraphSnapshot?: { nodes: unknown[]; edges: unknown[] };

  @Prop({ enum: ['A', 'B'] })
  abVariant?: 'A' | 'B';

  /** When set, run this email action once before resuming canvas traversal at `canvasNextNodeId`. */
  @Prop({ type: Object })
  pendingCanvasEmailAction?: Record<string, unknown>;

  /**
   * Last outbound CRM email tracking token from this workflow run (persists across delay/jitter jobs
   * so “wait for open” can follow a prior send even after a time delay).
   */
  @Prop()
  lastEmailTrackingToken?: string;

  /**
   * Poll for opens until `deadlineAt`; resume at `onOpenNodeId` or `onTimeoutNodeId`.
   * Same job document is rescheduled with `status: pending` until resolved.
   */
  @Prop({ type: Object })
  emailWait?: {
    trackingToken: string;
    deadlineAt: Date;
    pollIntervalMs: number;
    /** Canvas workflow: node ids */
    onOpenNodeId?: string;
    onTimeoutNodeId?: string;
    /** Branch / follow-up sequence: steps if not opened by deadline */
    branchOnTimeoutSteps?: unknown[];
    branchMode?: boolean;
    /** @deprecated Use alternateStepIndex >= 0 */
    alternateSent?: boolean;
    /** @deprecated Use per-step wait on alternateSteps */
    alternateWaitMs?: number;
    firstOutreachGate?: boolean;
    /** -1 = waiting on manual first outreach; 0+ = waiting on alternate step N after send */
    alternateStepIndex?: number;
    /** Chained alternate sends (wait + email each) */
    alternateSteps?: unknown[];
    firstWaitMs?: number;
  };
}

export const WorkflowDelayedJobSchema =
  SchemaFactory.createForClass(WorkflowDelayedJob);
/** Due work queue: pending jobs ready to run (see WorkflowsService.processDueDelayedJobs). */
WorkflowDelayedJobSchema.index({ status: 1, runAt: 1 });
WorkflowDelayedJobSchema.index({ workflowId: 1, entityId: 1 });
WorkflowDelayedJobSchema.index({ entityType: 1, entityId: 1, status: 1 });
/** Stale recovery: processing jobs stuck after API crash (see recoverStaleWorkflowProcessingJobs). */
WorkflowDelayedJobSchema.index({ status: 1, updatedAt: 1 });
/** Follow-up auto-recovery maintenance scan (see recoverMissedFollowUpAlternateSends). */
WorkflowDelayedJobSchema.index({
  branchLabel: 1,
  status: 1,
  autoRecoveryBlockedAt: 1,
  updatedAt: -1,
});
