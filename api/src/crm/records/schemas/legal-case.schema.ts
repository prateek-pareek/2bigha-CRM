import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type LegalCaseDocument = LegalCase & Document;

@Schema({ timestamps: true })
export class LegalCase {
  @Prop({ required: true })
  title: string;

  @Prop({
    default: 'contract_review',
    enum: ['contract_review', 'dispute', 'compliance', 'nda', 'other'],
    index: true,
  })
  caseType: 'contract_review' | 'dispute' | 'compliance' | 'nda' | 'other';

  @Prop()
  description?: string;

  @Prop()
  counterpartyName?: string;

  @Prop()
  contractValue?: number;

  @Prop()
  currency?: string;

  @Prop({
    default: 'medium',
    enum: ['low', 'medium', 'high', 'urgent'],
    index: true,
  })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @Prop()
  startDate?: Date;

  /** Renewal/expiry tracking (contract expiry, deadline, etc.). */
  @Prop()
  expiryDate?: Date;

  @Prop()
  jurisdiction?: string;

  @Prop({
    type: [{ name: String, url: String, uploadedAt: Date }],
    default: [],
  })
  documents?: { name: string; url: string; uploadedAt: Date }[];

  /** Assigned lawyer / owner label (same convention as Lead.leadOwner). */
  @Prop()
  caseOwner: string;

  @Prop({ type: Types.ObjectId, ref: 'Pipeline', index: true })
  pipeline: Types.ObjectId;

  @Prop({ default: 'Intake', index: true })
  stage: string; // Current stage in the legal case pipeline

  /**
   * The Client record this legal case relates to (optional; same convention as Lead.clientId).
   */
  @Prop({ type: Types.ObjectId, ref: 'Client', index: true })
  clientId?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Contact' }], default: [] })
  associatedContacts: Types.ObjectId[];

  /** Bidirectional link — see Lead.associatedLegalCases. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Lead' }], default: [] })
  associatedLeads: Types.ObjectId[];

  /** Values are strings, string[] (multi-select), or other JSON-serializable primitives. */
  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  /** Explicit per-record access grants for restricted users. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  /** HubSpot-style stable public id (optional on legacy rows; unique when set). */
  @Prop({ trim: true, sparse: true, unique: true })
  recordId?: string;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const LegalCaseSchema = SchemaFactory.createForClass(LegalCase);
applyCrmSoftDeletePlugin(LegalCaseSchema);
LegalCaseSchema.index({ isDeleted: 1, deletedAt: -1 });

/** Speeds up legal cases list / board when filtering by pipeline. */
LegalCaseSchema.index({ pipeline: 1, createdAt: -1 });
/** Speeds up "my legal cases" filtered list (owner + newest first). */
LegalCaseSchema.index({ caseOwner: 1, createdAt: -1 });
/** Fast path for ownership by creator ID when owner label is absent/changed. */
LegalCaseSchema.index({ createdBy: 1, createdAt: -1 });
/** Fast path for "shared with me" scoped lists. */
LegalCaseSchema.index({ sharedWith: 1, createdAt: -1 });
/** Client-scoped legal case lookups. */
LegalCaseSchema.index({ clientId: 1, createdAt: -1 });
/** Renewal/expiry reminders scan. */
LegalCaseSchema.index({ expiryDate: 1 });
/** Header global search (`$text` with regex fallback). */
LegalCaseSchema.index(
  {
    title: 'text',
    counterpartyName: 'text',
    description: 'text',
  },
  {
    name: 'legal_case_global_search_text',
    weights: { title: 8, counterpartyName: 5, description: 2 },
  },
);
