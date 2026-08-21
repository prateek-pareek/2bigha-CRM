import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CallLogDocument = CallLog & Document;

export type CallLogDirection = 'Incoming' | 'Outgoing';

/**
 * One row per Kommuno call, matching the "Call Logs" table (Agent/Client
 * name+number, duration, type, status, dates, follow-up, callback). Rows are
 * created two ways:
 *  - Outbound: created immediately when we call POST clickToCallWithLiveStatus
 *    (status starts as 'Initiated'), keyed by the `sessionId` we generated.
 *  - Inbound / completion: upserted from Kommuno's `call/event/callback`
 *    webhook by `sessionId` — creates the row if it doesn't exist yet
 *    (pure-incoming calls we never initiated) or fills in the final
 *    duration/status/recording on an existing outbound row.
 */
@Schema({ timestamps: true, collection: 'crm_ivr_call_logs' })
export class CallLog {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({ required: true, enum: ['Incoming', 'Outgoing'], index: true })
  direction: CallLogDirection;

  @Prop({ trim: true })
  agentName?: string;

  @Prop({ trim: true, index: true })
  agentNumber?: string;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({ trim: true, index: true })
  customerNumber?: string;

  /** Total call duration in seconds (Kommuno's `duration`). */
  @Prop({ default: 0 })
  duration: number;

  @Prop({ default: 0 })
  connectedDuration: number;

  @Prop({ default: 0 })
  ringingDuration: number;

  /** Raw Kommuno `overall_call_status` (e.g. 'patched') plus our friendlier label. */
  @Prop({ trim: true })
  rawStatus?: string;

  @Prop({
    default: 'Initiated',
    enum: [
      'Initiated',
      'Ringing',
      'Connected',
      'Missed',
      'Failed',
      'Completed',
      // Call Activity Form disposition default (manually-logged rows, not from Kommuno).
      'Not Answered',
    ],
  })
  status: string;

  /** Disposition notes captured on the Call Activity Form. */
  @Prop({ trim: true })
  notes?: string;

  /** True for rows created from the Call Activity Form ("Set Activity") rather than a real Kommuno session. */
  @Prop({ default: false })
  loggedManually?: boolean;

  @Prop()
  callDate?: Date;

  @Prop()
  callEndDate?: Date;

  @Prop({ trim: true })
  recordingUrl?: string;

  /** CRM-side scheduling fields — not from Kommuno, set by agents in our UI. */
  @Prop({ type: Date })
  followUpAt?: Date | null;

  @Prop({ type: Date })
  callbackScheduledAt?: Date | null;

  /** Set for outbound calls we initiated ourselves (links the row to the CRM user who clicked "Call"). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  initiatedByUserId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  relatedTo?: Types.ObjectId;

  @Prop({ trim: true })
  relatedType?: string;

  /** Full last-received webhook payload, kept for debugging until the integration is fully verified. */
  @Prop({ type: Object })
  rawPayload?: Record<string, unknown>;
}

export const CallLogSchema = SchemaFactory.createForClass(CallLog);
CallLogSchema.index({ direction: 1, createdAt: -1 });
CallLogSchema.index({ callDate: -1 });
CallLogSchema.index({ initiatedByUserId: 1, createdAt: -1 });
CallLogSchema.index({ relatedTo: 1, createdAt: -1 });
