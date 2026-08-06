import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

/** HubSpot-style automation triggers */
export const WORKFLOW_TRIGGERS = [
  'lead_created',
  'lead_updated',
  'lead_stage_changed',
  'lead_pipeline_changed',
  'lead_status_changed',
  'lead_source_changed',
  'lead_owner_changed',
  /** First open of a tracked CRM email (pixel) for this lead */
  'lead_tracked_email_opened',
  /** Inbound reply matched to a tracked CRM thread for this lead */
  'lead_tracked_email_replied',
  'deal_created',
  'deal_updated',
  'deal_stage_changed',
  'deal_pipeline_changed',
  'deal_value_changed',
  'deal_owner_changed',
  'deal_probability_changed',
  'deal_tracked_email_opened',
  'deal_tracked_email_replied',
  'contact_created',
  'contact_updated',
  'contact_email_changed',
  'contact_tracked_email_opened',
  'contact_tracked_email_replied',
  'organization_created',
  'organization_updated',
  'organization_name_changed',
  'organization_tracked_email_opened',
  'organization_tracked_email_replied',
  /** Started from lead/contact UI or POST /crm/workflows/:id/enroll (not fired by CRM mutations). */
  'manual_enrollment',
] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

/** How to pick a mailbox when multiple are configured on one send step. */
export type WorkflowMailboxSplitMode =
  | 'round_robin'
  | 'random'
  | 'sticky_entity';

export type WorkflowFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'changed_to'
  | 'changed_from_to'
  | 'greater_than'
  | 'less_than'
  | 'in_list'
  | 'not_in_list'
  | 'in_segment'
  | 'not_in_segment';

export type WorkflowAction =
  | { type: 'set_property'; field: string; value: string | number | boolean }
  | {
      type: 'move_pipeline_stage';
      pipelineId: string;
      stage: string;
    }
  | { type: 'add_to_segment'; segmentId: string }
  | { type: 'remove_from_segment'; segmentId: string }
  | {
      type: 'create_task';
      title: string;
      body?: string;
      dueInDays?: number;
      calendarEnabled?: boolean;
      reminderEnabled?: boolean;
      reminderBeforeMinutes?: number;
    }
  | { type: 'create_note'; body: string }
  | { type: 'notify_teams'; message: string; email: string; link?: string }
  | {
      type: 'http_webhook';
      url: string;
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
    }
  | { type: 'assign_owner'; ownerName: string }
  | {
      type: 'send_email_template';
      /** `template` (default); `custom` uses subject/body below; `ai_draft` generates per-record email with AI. */
      sendMode?: 'template' | 'custom' | 'ai_draft';
      templateId?: string;
      /** Used when sendMode is `custom` (HTML). Merge fields applied at send time. */
      subject?: string;
      body?: string;
      /** Optional extra guidance for AI drafting in workflow sends. */
      aiInstructions?: string;
      /** When set, send from this connected mailbox; otherwise the user’s default inbox is used. */
      inboxAccountId?: string;
      /**
       * Send from different mailboxes on the same step (load spread / deliverability).
       * When present with 2+ valid account ids, `inboxAccountId` is ignored.
       */
      mailboxSplit?: {
        mode: WorkflowMailboxSplitMode;
        accountIds: string[];
      };
      /**
       * Random delay 0…N seconds before send (reduces burst sends). Branch/canvas schedule a delayed job.
       */
      sendJitterSecondsMax?: number;
      /** When true, retry failed send through fallback mailbox list below. */
      retryOnSendFail?: boolean;
      /** Optional retry pool (used after primary mailbox fails). */
      fallbackInboxAccountIds?: string[];
      /** When true (default), recipient must match the CRM record’s email (recommended). Organizations skip enforcement. */
      enforceRecipientMatch?: boolean;
    };

/** Wait step (HubSpot “delay” / “wait until” simplified to fixed duration). */
export type WorkflowDelayStep = {
  type: 'delay';
  days?: number;
  hours?: number;
  minutes?: number;
};

/** Wait for tracked email open; on timeout run `onTimeoutSteps` then continue the main sequence. */
export type WorkflowWaitEmailOpenStep = {
  type: 'wait_email_open';
  waitDays?: number;
  waitHours?: number;
  waitMinutes?: number;
  /** Absolute deadline ISO — overrides relative wait when set. */
  deadlineAt?: string;
  onTimeoutSteps: WorkflowStep[];
};

export type WorkflowActionStep = { type: 'action'; action: WorkflowAction };

export type WorkflowStep =
  | WorkflowDelayStep
  | WorkflowActionStep
  | WorkflowWaitEmailOpenStep;

/** HubSpot-style branch: IF conditions match → run steps (including delays). */
export type WorkflowBranch = {
  id?: string;
  label: string;
  /** When true, runs only if no other branch matched (Otherwise path). */
  isElse?: boolean;
  filters: WorkflowFilter[];
  steps: WorkflowStep[];
};

/** Tracked outbound email engagement (see EmailTrackingService). */
export type WorkflowEventFilterType =
  | 'crm_email_has_been_opened'
  | 'crm_email_sent_but_never_opened';

export type WorkflowFilter = {
  field: string;
  operator: WorkflowFilterOperator;
  value?: string | number | boolean;
  /**
   * `property` (default) = field on the record; `event` = CRM email engagement rules;
   * `segment` = static or dynamic segment membership (`value` = segment id).
   */
  filterKind?: 'property' | 'event' | 'segment';
  eventType?: WorkflowEventFilterType;
};

/** HubSpot: once per record vs every time trigger fires */
export type EnrollmentPolicy = 'once' | 'every_time';

/** How primary + additional triggers combine when multiple are selected. */
export type WorkflowTriggerCombine = 'any' | 'all';

export type WorkflowDocument = Workflow & Document;

@Schema({ timestamps: true })
export class Workflow {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ required: true, enum: WORKFLOW_TRIGGERS })
  trigger: WorkflowTrigger;

  /** Optional extra triggers (multi-trigger workflow). */
  @Prop({ type: [String], enum: WORKFLOW_TRIGGERS, default: [] })
  triggers?: WorkflowTrigger[];

  /**
   * `any` = run when any selected trigger fires (default).
   * `all` = run only after every selected trigger has fired at least once (order-free).
   */
  @Prop({ enum: ['any', 'all'], default: 'any' })
  triggerCombine?: WorkflowTriggerCombine;

  /** Entry criteria — all must pass (AND). */
  @Prop({ type: [Object], default: [] })
  filters: WorkflowFilter[];

  /**
   * Legacy flat list of actions (no branch, no delay).
   * If `branches` is non-empty, branches take precedence.
   */
  @Prop({ type: [Object], default: [] })
  actions: WorkflowAction[];

  /**
   * HubSpot-style IF/ELSE branches. First matching branch wins; use `isElse` for “Otherwise”.
   */
  @Prop({ type: [Object], default: [] })
  branches: WorkflowBranch[];

  /** @deprecated Prefer `enrollmentPolicy` */
  @Prop({ default: false })
  onlyOncePerRecord: boolean;

  /** `once` = enroll once per record; `every_time` = run whenever filters match (no enrollment lock). */
  @Prop({ enum: ['once', 'every_time'] })
  enrollmentPolicy?: EnrollmentPolicy;

  /** Visual React Flow graph: nodes + edges (see portal `WorkflowCanvasEditor`). */
  @Prop({ type: Object })
  canvasGraph?: { nodes: unknown[]; edges: unknown[] };

  /** `canvas` uses `canvasGraph`; `branches` uses `branches` / legacy `actions`. */
  @Prop({ enum: ['branches', 'canvas'], default: 'branches' })
  editorMode?: 'branches' | 'canvas';

  /** Conversion goal (filters on record = goal met). Used for reporting. */
  @Prop({ type: Object })
  goal?: { enabled: boolean; label?: string; filters: unknown[] };

  /**
   * When true (default), pending delayed sends for this workflow are cancelled if the
   * lead/contact replies before the scheduled send time.
   */
  @Prop({ default: true })
  cancelOnReply?: boolean;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow);
applyCrmSoftDeletePlugin(WorkflowSchema);
WorkflowSchema.index({ isDeleted: 1, deletedAt: -1 });
WorkflowSchema.index({ enabled: 1, trigger: 1 });
