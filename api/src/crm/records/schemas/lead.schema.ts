import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type LeadDocument = Lead & Document;

@Schema({ timestamps: true })
export class Lead {
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
  source: string; // Ref to CRM Lead Source

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

  @Prop()
  linkedinUrl: string;

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

  @Prop()
  image: string;

  /** Values are strings, string[] (multi-select), or other JSON-serializable primitives. */
  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: Object })
  sourceMetadata?: {
    title?: string;
    description?: string;
    image?: string;
    authorName?: string;
    authorPhoto?: string;
    type?: 'linkedin' | 'threads' | 'facebook' | 'generic';
    url: string;
  };

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

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Deal' }], default: [] })
  associatedDeals: Types.ObjectId[];

  /** Heuristic 0–100 conversion likelihood; recomputed on lead changes, activities, and email engagement. */
  @Prop({ min: 0, max: 100, index: true })
  leadScore?: number;

  @Prop()
  leadScoreUpdatedAt?: Date;

  /** Sub-scores: completeness, firmographic, stageFit, engagement */
  @Prop({ type: Object })
  leadScoreBreakdown?: Record<string, number>;

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
/** Helps email-based search and dedupe checks on huge datasets. */
LeadSchema.index({ email: 1, createdAt: -1 });
/** Platform opportunities list (Upwork, Freelancer, etc.). */
LeadSchema.index({ leadType: 1, createdAt: -1 });
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
