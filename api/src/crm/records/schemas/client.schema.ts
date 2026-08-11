import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type ClientDocument = Client & Document;

@Schema({ timestamps: true })
export class Client {
  @Prop({ required: true })
  name: string;

  @Prop({ required: false, unique: true, sparse: true })
  email: string;

  @Prop({ type: [String], default: [] })
  additionalEmails: string[];

  /** Suppressed addresses for this record (hard bounces / invalid recipient). */
  @Prop({ type: [String], default: [] })
  invalidEmails: string[];

  @Prop()
  phone: string;

  /** WhatsApp contact number, if different from `phone`. */
  @Prop()
  whatsappNumber?: string;

  /** Free-text mailing address (city/state, per the Add Lead "create new user" form). */
  @Prop()
  address?: string;

  /** Profile photo URL uploaded when creating this client from the Add Lead flow. */
  @Prop()
  photoUrl?: string;

  /**
   * CRM-side role label for this contact (Add Lead "User Type" field) — OWNER/AGENT/USER.
   * Distinct from `User.role` (app login/permissions role); this only classifies the
   * client record itself and has no bearing on authentication.
   */
  @Prop({ enum: ['OWNER', 'AGENT', 'USER'] })
  role?: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization' })
  organization: Types.ObjectId;

  @Prop({ default: 'active', enum: ['active', 'inactive', 'prospective'] })
  status: string;

  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }] })
  assignedTo: Types.ObjectId[];

  /** Original CRM lead when this client was created from a lead or deal that had a lead. */
  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  sourceLead?: Types.ObjectId;

  /** HubSpot-style links to other CRM records (merged email engagement uses these). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Lead' }], default: [] })
  associatedLeads: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Deal' }], default: [] })
  associatedDeals: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Organization' }], default: [] })
  associatedOrganizations: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Contact' }], default: [] })
  associatedContacts: Types.ObjectId[];

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
applyCrmSoftDeletePlugin(ClientSchema);
ClientSchema.index({ isDeleted: 1, deletedAt: -1 });

ClientSchema.index(
  { name: 'text', email: 'text' },
  { name: 'client_global_search_text', weights: { name: 8, email: 10 } },
);
