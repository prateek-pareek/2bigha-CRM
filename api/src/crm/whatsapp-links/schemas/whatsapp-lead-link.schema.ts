import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsAppLeadLinkDocument = WhatsAppLeadLink & Document;

@Schema({ _id: false })
export class WhatsAppTemporaryGrant {
  @Prop({ type: Types.ObjectId, ref: 'CRMUser', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: ['read', 'read_write'], required: true })
  accessType: 'read' | 'read_write';

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const WhatsAppTemporaryGrantSchema = SchemaFactory.createForClass(WhatsAppTemporaryGrant);

/**
 * Explicit attachment of a WhatsApp conversation (identified by `waId`,
 * the digits-only phone number used across WhatsAppMessage) to a Lead.
 *
 * A dedicated collection rather than a field on Lead — Lead's schema is
 * being actively worked on elsewhere, and this keeps the link fully
 * self-contained (create/move/remove without touching the Lead document).
 * One `waId` maps to at most one Lead (unique); a Lead may have more than
 * one linked number.
 *
 * Also doubles as the per-conversation "agent assignment" record (`assignee`)
 * — there's no separate Conversation entity in this module (see
 * WhatsAppService.getUniqueContacts), and a number can be triaged/assigned
 * to an agent before it's ever linked to a Lead, so `leadId` is optional and
 * a bare assignee-only row is a valid state.
 */
@Schema({ timestamps: true, collection: 'whatsapp_lead_links' })
export class WhatsAppLeadLink {
  @Prop({ required: true, unique: true, index: true })
  waId: string;

  @Prop({ type: Types.ObjectId, ref: 'Lead', index: true })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser' })
  linkedBy?: Types.ObjectId;

  /** CRM user this WhatsApp conversation is assigned to for triage/ownership. */
  @Prop({ type: Types.ObjectId, ref: 'CRMUser', index: true })
  assignee?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser' })
  assignedBy?: Types.ObjectId;

  @Prop({ type: [WhatsAppTemporaryGrantSchema], default: [] })
  temporaryGrants?: WhatsAppTemporaryGrant[];
}

export const WhatsAppLeadLinkSchema =
  SchemaFactory.createForClass(WhatsAppLeadLink);
