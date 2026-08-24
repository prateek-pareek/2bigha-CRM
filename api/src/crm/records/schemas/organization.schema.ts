import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true })
  name: string;

  @Prop()
  website: string;

  @Prop()
  territory: string;

  @Prop()
  industry: string;

  @Prop()
  noOfEmployees: string;

  @Prop()
  annualRevenue: number;

  @Prop()
  phone: string;

  @Prop()
  email: string;

  @Prop()
  address: string;

  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  /** Contacts linked to this company (HubSpot-style association). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Contact' }], default: [] })
  associatedContacts: Types.ObjectId[];

  /** Leads linked to this company. */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Lead' }], default: [] })
  associatedLeads: Types.ObjectId[];

  /** HubSpot-style company / organization public id (optional on legacy rows). */
  @Prop({ trim: true, sparse: true, unique: true })
  recordId?: string;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
applyCrmSoftDeletePlugin(OrganizationSchema);
OrganizationSchema.index({ isDeleted: 1, deletedAt: -1 });
OrganizationSchema.index({ 'customFields.email_domain': 1 });
OrganizationSchema.index({ website: 1 });

OrganizationSchema.index(
  { name: 'text', industry: 'text', email: 'text' },
  { name: 'organization_global_search_text', weights: { name: 10, email: 6 } },
);
