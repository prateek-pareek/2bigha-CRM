import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type ActivityDocument = Activity & Document;

@Schema({ timestamps: true })
export class Activity {
  @Prop({
    required: true,
    enum: [
      'Comment',
      'Activity',
      'Note',
      'Call',
      'Task',
      'Event',
      'Meeting',
      'Email',
      'DM',
      'System',
    ],
  })
  type: string;

  @Prop()
  title: string;

  @Prop()
  content: string;

  @Prop({ type: Types.ObjectId })
  relatedTo: Types.ObjectId; // ID of Lead, Deal, Contact, or Organization

  @Prop()
  relatedType: string; // 'Lead', 'Deal', 'Contact', 'Organization'

  @Prop({ type: Types.ObjectId, ref: 'CRMUser' })
  author: Types.ObjectId;

  /** Task owner — who should complete the work (reporter is `author`). */
  @Prop({ type: Types.ObjectId, ref: 'CRMUser' })
  assignee: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Pipeline' })
  pipelineId: Types.ObjectId;

  @Prop()
  status: string; // Dynamic stage name from Pipeline

  @Prop({ type: Object })
  metadata: any; // Additional data like call duration, event time, etc.

  /**
   * Enterprise-grade tagging: explicitly link this activity to multiple CRM records.
   * This ensures 100% reliable synchronization without complex query discovery.
   */
  @Prop({
    type: [
      {
        id: { type: Types.ObjectId, index: true },
        type: { type: String }, // 'Lead', 'Contact', 'Organization', 'Deal', 'Client'
      },
    ],
    default: [],
  })
  involvedEntities: { id: Types.ObjectId; type: string }[];

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
applyCrmSoftDeletePlugin(ActivitySchema);
ActivitySchema.index({ isDeleted: 1, deletedAt: -1 });
// Composite index for ultra-fast timeline queries
ActivitySchema.index({ 'involvedEntities.id': 1, createdAt: -1 });
// Compound index to speed up $lookup aggregations from CRM workspace (find last touch of a lead/deal)
ActivitySchema.index({ relatedTo: 1, relatedType: 1, createdAt: -1 });
// Non-unique because one inbound message may intentionally be linked to multiple CRM entities.
// These indexes make sync-time and timeline deduplication fast without a risky data migration.
ActivitySchema.index({ 'metadata.inboxEmailId': 1 });
ActivitySchema.index({ 'metadata.inboundMessageKey': 1 });
ActivitySchema.index({ 'metadata.inboundRfcMessageKey': 1 });
