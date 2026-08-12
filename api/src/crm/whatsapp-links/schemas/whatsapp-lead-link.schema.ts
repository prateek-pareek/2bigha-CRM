import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsAppLeadLinkDocument = WhatsAppLeadLink & Document;

/**
 * Explicit attachment of a WhatsApp conversation (identified by `waId`,
 * the digits-only phone number used across WhatsAppMessage) to a Lead.
 *
 * A dedicated collection rather than a field on Lead — Lead's schema is
 * being actively worked on elsewhere, and this keeps the link fully
 * self-contained (create/move/remove without touching the Lead document).
 * One `waId` maps to at most one Lead (unique); a Lead may have more than
 * one linked number.
 */
@Schema({ timestamps: true, collection: 'whatsapp_lead_links' })
export class WhatsAppLeadLink {
  @Prop({ required: true, unique: true, index: true })
  waId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Lead', index: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser' })
  linkedBy?: Types.ObjectId;
}

export const WhatsAppLeadLinkSchema =
  SchemaFactory.createForClass(WhatsAppLeadLink);
