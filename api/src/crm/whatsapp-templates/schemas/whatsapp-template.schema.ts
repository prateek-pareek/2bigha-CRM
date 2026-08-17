import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WhatsAppTemplateDocument = WhatsAppTemplate & Document;

export type WhatsAppTemplateStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISABLED'
  | 'PAUSED';

export type WhatsAppTemplateCategory =
  | 'MARKETING'
  | 'UTILITY'
  | 'AUTHENTICATION';

export type WhatsAppTemplateSource = 'local' | 'meta' | 'aisensy';

/**
 * A WhatsApp message template — either authored locally and submitted to
 * Meta for approval, or mirrored in from Meta's own template catalog during
 * a status sync. This is the source of truth for the new standalone
 * WhatsApp module (`/crm/whatsapp/templates`).
 *
 * Kept independent from `Integration.templates` (the ad-hoc cache used by
 * the older settings page / inbox template picker) — see
 * WhatsAppTemplatesService for the rationale.
 */
@Schema({ timestamps: true, collection: 'whatsapptemplates' })
export class WhatsAppTemplate {
  @Prop({ required: true })
  name: string; // lowercase, [a-z0-9_]+ per Meta's naming rule

  @Prop({ required: true })
  language: string; // e.g. 'en_US'

  @Prop({
    required: true,
    enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
  })
  category: WhatsAppTemplateCategory;

  @Prop({ type: [Object], default: [] })
  components: Record<string, any>[]; // HEADER / BODY / FOOTER / BUTTONS

  @Prop({
    required: true,
    enum: [
      'DRAFT',
      'SUBMITTED',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'DISABLED',
      'PAUSED',
    ],
    default: 'DRAFT',
  })
  status: WhatsAppTemplateStatus;

  @Prop()
  metaTemplateId?: string; // Meta's `id` once submitted/synced

  @Prop()
  rejectionReason?: string;

  @Prop()
  qualityScore?: string; // Meta's quality_score.score, when returned

  @Prop({ enum: ['local', 'meta', 'aisensy'], default: 'local' })
  source: WhatsAppTemplateSource;

  /**
   * The Campaign name this template maps to in the AiSensy dashboard
   * (Manage → Campaigns) — required to send this template via AiSensy's
   * Campaign API (see AiSensyClient). AiSensy doesn't expose a public
   * create/approve-template endpoint, so unlike `submit()` (Meta), linking
   * this is a manual step: create & get the template approved in AiSensy's
   * dashboard first, then record the mapping here.
   */
  @Prop()
  aisensyCampaignName?: string;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser' })
  createdBy?: Types.ObjectId;

  @Prop()
  submittedAt?: Date;

  @Prop()
  approvedAt?: Date;

  @Prop()
  lastSyncedAt?: Date;

  @Prop()
  lastError?: string;
}

export const WhatsAppTemplateSchema =
  SchemaFactory.createForClass(WhatsAppTemplate);

WhatsAppTemplateSchema.index({ name: 1, language: 1 }, { unique: true });
WhatsAppTemplateSchema.index({ metaTemplateId: 1 }, { sparse: true });
WhatsAppTemplateSchema.index({ status: 1 });
