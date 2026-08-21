import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LeadIntentEventDocument = LeadIntentEvent & Document;

export type LeadIntentEventSource = 'add_lead_form' | 'call_activity' | 'manual';

/**
 * One row per Lead Intent set/change — the append-only log backing the Lead
 * Intent Analytics dashboard (date + agent filters). The lead's *current*
 * intent(s) live denormalized on `Lead.leadIntents` for fast list/filter;
 * this collection is the history/analytics source of truth.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'crm_lead_intent_events' })
export class LeadIntentEvent {
  @Prop({ type: Types.ObjectId, ref: 'Lead', required: true, index: true })
  leadId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  intentLabel: string;

  @Prop()
  followUpAt?: Date;

  @Prop({
    required: true,
    enum: ['add_lead_form', 'call_activity', 'manual'],
    default: 'manual',
  })
  source: LeadIntentEventSource;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  setBy?: Types.ObjectId;

  @Prop({ trim: true })
  setByName?: string;
}

export const LeadIntentEventSchema = SchemaFactory.createForClass(LeadIntentEvent);
LeadIntentEventSchema.index({ leadId: 1, createdAt: -1 });
LeadIntentEventSchema.index({ setBy: 1, createdAt: -1 });
LeadIntentEventSchema.index({ intentLabel: 1, createdAt: -1 });
