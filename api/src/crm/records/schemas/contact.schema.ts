import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type ContactDocument = Contact & Document;

@Schema({ timestamps: true })
export class Contact {
  @Prop({ required: true })
  firstName: string;

  @Prop()
  middleName: string;

  @Prop()
  lastName: string;

  /** Mirrors lead status; optional on standalone contacts */
  @Prop({ default: 'New', index: true })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'Pipeline', index: true })
  pipeline: Types.ObjectId;

  @Prop({ default: 'New', index: true })
  stage: string;

  @Prop()
  email: string;

  @Prop({ type: [String], default: [] })
  additionalEmails: string[];

  /** Suppressed addresses for this record (hard bounces / invalid recipient). */
  @Prop({ type: [String], default: [] })
  invalidEmails: string[];

  @Prop()
  phone: string;

  @Prop()
  mobileNo: string;

  @Prop()
  organization: string;

  @Prop()
  jobTitle: string;

  @Prop()
  source: string;

  @Prop()
  industry: string;

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

  @Prop()
  territory: string;

  @Prop()
  image: string;

  /** @username, phone, or https://t.me/... — used for Telegram link on contact record */
  @Prop()
  telegram: string;

  @Prop()
  gender: string;

  @Prop()
  salutation: string;

  @Prop()
  address: string;

  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  /** Explicit per-record access grants for restricted users. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  /** Lead this contact was converted from (immutable; also listed in associatedLeads). */
  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  sourceLead?: Types.ObjectId;

  /** HubSpot-style links to other CRM records (merged email history uses these). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Lead' }], default: [] })
  associatedLeads: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Organization' }], default: [] })
  associatedOrganizations: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Contact' }], default: [] })
  associatedContacts: Types.ObjectId[];

  @Prop({ type: Object })
  sourceMetadata?: {
    title?: string;
    description?: string;
    image?: string;
    authorName?: string;
    authorPhoto?: string;
    type?: 'linkedin' | 'generic';
    url: string;
  };

  @Prop({ trim: true, sparse: true, unique: true })
  recordId?: string;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const ContactSchema = SchemaFactory.createForClass(Contact);
applyCrmSoftDeletePlugin(ContactSchema);
ContactSchema.index({ isDeleted: 1, deletedAt: -1 });
/** Contacts list default sort path (newest first). */
ContactSchema.index({ createdAt: -1 });
/** Speeds up "my contacts" filtered list by owner label. */
ContactSchema.index({ leadOwner: 1, createdAt: -1 });
/** Fast path for ownership by creator ID when owner label is absent/changed. */
ContactSchema.index({ createdBy: 1, createdAt: -1 });
/** Fast path for "shared with me" scoped lists. */
ContactSchema.index({ sharedWith: 1, createdAt: -1 });
/** Supports pipeline-scoped contact views with newest-first ordering. */
ContactSchema.index({ pipeline: 1, createdAt: -1 });
/** Helps email-based search and dedupe checks on huge datasets. */
ContactSchema.index({ email: 1, createdAt: -1 });
ContactSchema.index(
  {
    firstName: 'text',
    lastName: 'text',
    email: 'text',
    mobileNo: 'text',
    phone: 'text',
  },
  {
    name: 'contact_global_search_text',
    weights: { email: 10, firstName: 6, lastName: 6 },
  },
);
