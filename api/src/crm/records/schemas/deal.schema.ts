import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type DealDocument = Deal & Document;

@Schema({ timestamps: true })
export class Deal {
  @Prop({ required: false })
  organization?: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: 0 })
  probability: number;

  @Prop({ type: Types.ObjectId, ref: 'Pipeline', index: true })
  pipeline: Types.ObjectId;

  @Prop({ required: true, default: 'Qualification', index: true })
  stage: string; // Current stage in the pipeline

  @Prop()
  dealValue: number;

  /**
   * How `dealValue` should be interpreted:
   * - fixed: one-time / fixed-price project amount
   * - monthly: recurring monthly payment (retainer)
   */
  @Prop({ default: 'fixed', enum: ['fixed', 'monthly'], index: true })
  pricingType: 'fixed' | 'monthly';

  /** For monthly pricing: engagement length in months (default 12 when forecasting). */
  @Prop()
  contractMonths?: number;

  @Prop()
  expectedDealValue: number;

  @Prop()
  dealOwner: string;

  @Prop({ type: Types.ObjectId, ref: 'Contact' })
  contactPerson?: Types.ObjectId;

  /** Additional contacts on this deal (primary can remain `contactPerson`). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Contact' }], default: [] })
  associatedContacts: Types.ObjectId[];

  /** Additional companies linked to this deal (beyond legacy `organization` text/id). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Organization' }], default: [] })
  associatedCompanies: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  lead: Types.ObjectId;

  @Prop()
  expectedClosureDate: Date;

  @Prop()
  closedDate: Date;

  @Prop()
  nextStep: string;

  @Prop()
  currency: string;

  @Prop({ default: 1 })
  exchangeRate: number;

  @Prop({ type: Map, of: String })
  /** Values are strings, string[] (multi-select), or other JSON-serializable primitives. */
  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  /** Explicit per-record access grants for restricted users. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  @Prop({ trim: true, sparse: true, unique: true })
  recordId?: string;

  @Prop({ unique: true, sparse: true })
  portalToken: string;

  /** Optional preferred base URL for this deal's client portal (e.g. https://portal.example.com). */
  @Prop({ trim: true })
  portalDomain?: string;

  /** Linked PM board (Mongo id on PM database) for delivery status on the client portal. */
  @Prop({ type: Types.ObjectId })
  portalPmProjectId?: Types.ObjectId;

  /** Plain text / light markdown shown to the client as project scope. */
  @Prop()
  portalScopeSummary?: string;

  /** Optional bcrypt hash for password-protected client portal access. */
  @Prop()
  portalPasswordHash?: string;

  /** Whether clients can use Google SSO option on portal login screen. */
  @Prop({ default: false })
  portalGoogleLoginEnabled?: boolean;

  @Prop({ type: [{ name: String, url: String, category: String, uploadedBy: String, type: { type: String, enum: ['admin_provided', 'client_uploaded'] }, satisfiedNeedId: String, createdAt: Date }], default: [] })
  portalDocuments?: { name: string; url: string; category?: string; uploadedBy?: string; type: 'admin_provided' | 'client_uploaded'; satisfiedNeedId?: string; createdAt: Date }[];

  @Prop({ type: [{ label: String, status: { type: String, enum: ['pending', 'in-progress', 'completed'] }, percentage: Number }], default: [] })
  portalMilestones?: { label: string; status: 'pending' | 'in-progress' | 'completed'; percentage: number }[];

  @Prop({ type: [{ label: String, date: Date }], default: [] })
  portalDeadlines?: { label: string; date: Date }[];

  /** Last sales agent run summary and pending approval state. */
  @Prop({ type: Object })
  agentContext?: {
    lastRunId?: string;
    summary?: string;
    status?: string;
    pendingApprovals?: boolean;
    updatedAt?: string;
  };

  createdAt: Date;
  updatedAt: Date;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const DealSchema = SchemaFactory.createForClass(Deal);
applyCrmSoftDeletePlugin(DealSchema);
DealSchema.index({ isDeleted: 1, deletedAt: -1 });

DealSchema.index({ pipeline: 1, createdAt: -1 });
DealSchema.index({ sharedWith: 1, createdAt: -1 });
DealSchema.index(
  { title: 'text', organization: 'text' },
  { name: 'deal_global_search_text', weights: { title: 8, organization: 5 } },
);
