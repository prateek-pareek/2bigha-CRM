import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';
import {
  CRM_WORKSPACE_MODULES,
  CrmWorkspaceModule,
  DEFAULT_LEAD_WORKSPACE_MODULE,
} from '../../shared/crm-workspace-module.util';

export type LeadDocument = Lead & Document;

@Schema({ timestamps: true })
export class Lead {
  /**
   * Workspace boundary (RBAC/workspace-isolation layer). Defaults to '2Bigha' so
   * every lead created before this field existed is treated as a 2Bigha-workspace lead.
   */
  @Prop({ enum: CRM_WORKSPACE_MODULES, default: DEFAULT_LEAD_WORKSPACE_MODULE, index: true })
  module: CrmWorkspaceModule;

  @Prop({ required: true })
  firstName: string;

  @Prop()
  middleName: string;

  @Prop()
  lastName: string;

  @Prop({ required: true, default: 'New', index: true })
  status: string; // Ref to CRM Lead Status (legacy, stage takes precedence when pipeline is set)

  @Prop({ type: Types.ObjectId, ref: 'Pipeline', index: true })
  pipeline: Types.ObjectId;

  @Prop({ default: 'New', index: true })
  stage: string; // Current stage in the lead pipeline

  /** Latest outbound call outcome for this lead (synced with call activity UI). */
  @Prop({
    enum: ['Not Called', 'Completed', 'Missed', 'Busy', 'Failed', 'Not Answered'],
    default: 'Not Called',
    index: true,
  })
  callStatus?: string;

  @Prop({ index: true })
  email: string;

  /** Alternate addresses for the same person (CC, etc.) */
  @Prop({ type: [String], default: [] })
  additionalEmails: string[];

  /** Suppressed addresses for this record (hard bounces / invalid recipient). */
  @Prop({ type: [String], default: [] })
  invalidEmails: string[];

  @Prop()
  mobileNo: string;

  @Prop()
  phone: string;

  @Prop()
  organization: string;

  @Prop()
  jobTitle: string;

  @Prop()
  industry: string; // Ref to CRM Industry

  @Prop()
  annualRevenue: number;

  @Prop()
  noOfEmployees: string;

  @Prop()
  leadOwner: string;

  @Prop({ default: false })
  converted: boolean;

  @Prop()
  website: string;

  /** X/Twitter @handle (stored without @) for cold-DM outreach. */
  @Prop({ trim: true, index: true })
  twitterHandle?: string;

  /**
   * Public job post, project, or profile URL from a marketplace (Upwork, Naukri, etc.)
   * when email/phone are not available yet.
   */
  @Prop()
  opportunityListingUrl?: string;

  /** Human-readable portal name, e.g. "Upwork", "LinkedIn Jobs". */
  @Prop()
  opportunitySourcePlatform?: string;

  /**
   * `platform` = freelance/job-board prospect tracked without email/phone (see Platform opportunities CRM module).
   * `standard` = normal lead (default).
   */
  @Prop({ default: 'standard', index: true })
  leadType?: 'standard' | 'platform';

  /**
   * Business vertical this lead belongs to — determines which set of `type:'leads'`
   * Pipeline documents (and their fully admin-customizable stages) apply to it.
   * Defaults to 'property_listing' so pre-existing leads keep working unchanged.
   */
  @Prop({
    enum: ['property_listing', 'property_management'],
    default: 'property_listing',
    index: true,
  })
  leadVertical?: 'property_listing' | 'property_management';

  /** Client or company label on the platform when no email exists yet. */
  @Prop()
  platformClientLabel?: string;

  /** Latest outreach action on the platform (apply, message, etc.). */
  @Prop({
    enum: [
      'saved',
      'applied',
      'messaged',
      'interview',
      'hired',
      'rejected',
      'withdrawn',
      'no_response',
    ],
  })
  platformEngagementStatus?: string;

  @Prop()
  platformLastEngagedAt?: Date;

  @Prop()
  territory: string;

  /** CRM service offering (directory); replaces ad-hoc custom field RELATED_SERVICE. */
  @Prop({ type: Types.ObjectId, ref: 'ServiceOffering', index: true })
  relatedService?: Types.ObjectId;

  /**
   * The Client record picked/created in the "Add Lead" client-selection step.
   * Optional — leads created via the plain form (no client search) leave this unset.
   */
  @Prop({ type: Types.ObjectId, ref: 'Client', index: true })
  clientId?: Types.ObjectId;

  /**
   * Business classification shown as lead-list tabs (Reference/Investor/Lead/Buyer lead).
   * Value is the `label` of an active `LeadPicklistOption` with listKey 'leadCategory'.
   * Distinct from `leadType`, which is an internal standard/platform flag.
   */
  @Prop({ trim: true, index: true })
  leadCategory?: string;

  /**
   * Seller/Buyer-style grouping shown in the "Group" filter and Set Activity/View Lead cards.
   * Value is the `label` of an active `LeadPicklistOption` with listKey 'group'.
   */
  @Prop({ trim: true, index: true })
  group?: string;

  /** Free-text note captured on the Add Lead / Edit Lead form. */
  @Prop()
  notes?: string;

  /**
   * Optional date/time to follow up with this lead. Drives the reminder
   * notification fired by LeadFollowUpReminderCronService (see crm/records/lead-followup-reminder-cron.service.ts).
   */
  @Prop()
  nextFollowUpAt?: Date;

  /**
   * Bookkeeping only — timestamp the follow-up reminder was last sent.
   * Cleared whenever `nextFollowUpAt` changes so a new reminder fires for the new date.
   */
  @Prop()
  followUpReminderSentAt?: Date;

  /**
   * Onboarding checklist state for this lead — keyed by the `label` of an active
   * `LeadPicklistOption` with listKey 'checklistItem' (see Settings > Lead Type & Group).
   * Absent/false = not done. Shown on the Lead detail page only.
   */
  @Prop({ type: Object, default: {} })
  checklistProgress?: Record<string, boolean>;

  /**
   * Current Lead Intent selection(s) — potential future opportunities (client may
   * become a Buyer/Seller/Investor, buy a Subscription, or list a Property/Farm
   * later). Values are labels of active `LeadPicklistOption` rows with
   * listKey 'leadIntent'. Every set/change is additionally recorded as a
   * LeadIntentEvent (see records/schemas/lead-intent-event.schema.ts) for the
   * Lead Intent Analytics dashboard.
   */
  @Prop({ type: [String], default: [], index: true })
  leadIntents?: string[];

  /** When to reconnect about the current lead intent(s). */
  @Prop()
  leadIntentFollowUpAt?: Date;

  /**
   * Denormalized creator display name, set alongside `createdBy` at creation time so
   * "search by Created By / agent name" doesn't require a $lookup on every query.
   * Leads created before this field existed simply won't match a Created-By search.
   */
  @Prop({ trim: true })
  createdByName?: string;

  @Prop()
  image: string;

  /** Values are strings, string[] (multi-select), or other JSON-serializable primitives. */
  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  /** Explicit per-record access grants for restricted users. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  /** Company records (e.g. after HubSpot import). Kept in sync to contact via syncContactFromLead. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Organization' }], default: [] })
  associatedOrganizations: Types.ObjectId[];

  /** Other leads related to the same opportunity or person (optional). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Lead' }], default: [] })
  associatedLeads: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Contact' }], default: [] })
  associatedContacts: Types.ObjectId[];

  /** Legal cases referencing this lead (bidirectional; see LegalCase.associatedLeads). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'LegalCase' }], default: [] })
  associatedLegalCases: Types.ObjectId[];

  /** HubSpot-style stable public id (optional on legacy rows; unique when set). */
  @Prop({ trim: true, sparse: true, unique: true })
  recordId?: string;

  /** Last sales agent run summary and pending approval state. */
  @Prop({ type: Object })
  agentContext?: {
    lastRunId?: string;
    summary?: string;
    status?: string;
    pendingApprovals?: boolean;
    updatedAt?: string;
  };

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
applyCrmSoftDeletePlugin(LeadSchema);
LeadSchema.index({ isDeleted: 1, deletedAt: -1 });

/** Default workspace-boundary filter applied to every leads list query. */
LeadSchema.index({ module: 1, createdAt: -1 });
/** Speeds up CRM leads list / board when filtering by pipeline. */
LeadSchema.index({ pipeline: 1, createdAt: -1 });
/** Speeds up large-scale lead pagination for default/non-converted board list. */
LeadSchema.index({ converted: 1, pipeline: 1, createdAt: -1 });
/** Speeds up "my leads" filtered list (owner + newest first). */
LeadSchema.index({ leadOwner: 1, createdAt: -1 });
/** Fast path for ownership by creator ID when owner label is absent/changed. */
LeadSchema.index({ createdBy: 1, createdAt: -1 });
/** Fast path for "shared with me" scoped lists. */
LeadSchema.index({ sharedWith: 1, createdAt: -1 });
/** Follow-up reminder cron scans for due/upcoming nextFollowUpAt. */
LeadSchema.index({ nextFollowUpAt: 1 });
/** Helps email-based search and dedupe checks on huge datasets. */
LeadSchema.index({ email: 1, createdAt: -1 });
/** Platform opportunities list (Upwork, Freelancer, etc.). */
LeadSchema.index({ leadType: 1, createdAt: -1 });
/** Property Listing / Property Management vertical toggle + board. */
LeadSchema.index({ leadVertical: 1, pipeline: 1, createdAt: -1 });
/** Lead-type tab bar (All Leads/Reference/Investor/Lead/Buyer lead). */
LeadSchema.index({ leadCategory: 1, createdAt: -1 });
/** "Group" filter. */
LeadSchema.index({ group: 1, createdAt: -1 });
/** Lead Intent List / filter. */
LeadSchema.index({ leadIntents: 1, createdAt: -1 });
/** Add Lead client-selection step: list leads already linked to a given client. */
LeadSchema.index({ clientId: 1, createdAt: -1 });
/** Header global search (`$text` with regex fallback). */
LeadSchema.index(
  {
    firstName: 'text',
    lastName: 'text',
    email: 'text',
    organization: 'text',
    mobileNo: 'text',
    phone: 'text',
  },
  {
    name: 'lead_global_search_text',
    weights: { email: 10, firstName: 6, lastName: 6, organization: 4 },
  },
);
