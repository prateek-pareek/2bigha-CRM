import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type CrmSalesStrategyDocument = CrmSalesStrategy & Document;

export type CrmSalesStrategyStatus =
  | 'draft'
  | 'active'
  | 'completed'
  | 'archived';

@Schema({ _id: false })
export class CrmSalesStrategyGoal {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  metric?: string;

  @Prop({ trim: true })
  target?: string;
}

export const CrmSalesStrategyGoalSchema =
  SchemaFactory.createForClass(CrmSalesStrategyGoal);

@Schema({ timestamps: true, collection: 'crm_sales_strategies' })
export class CrmSalesStrategy {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  summary?: string;

  @Prop({ trim: true })
  objective?: string;

  @Prop({
    type: String,
    enum: ['draft', 'active', 'completed', 'archived'],
    default: 'draft',
  })
  status: CrmSalesStrategyStatus;

  /** e.g. Enterprise, Mid-market, SMB */
  @Prop({ type: [String], default: [] })
  segments: string[];

  /** e.g. Outbound, Inbound, Partner, Expansion */
  @Prop({ type: [String], default: [] })
  motionTypes: string[];

  @Prop({ type: [String], default: [] })
  icpNotes: string[];

  @Prop({ type: [String], default: [] })
  channels: string[];

  @Prop({ type: [String], default: [] })
  playbookSteps: string[];

  @Prop({ type: [String], default: [] })
  keyMessages: string[];

  @Prop({ type: [CrmSalesStrategyGoalSchema], default: [] })
  goals: CrmSalesStrategyGoal[];

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ trim: true })
  quotaTarget?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  /**
   * Record-level ACL: CRM user ids who may view/edit this strategy
   * (in addition to module permission). Empty = creator + CRM top admins only.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  authorizedUserIds: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  ownerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CrmSalesStrategySchema =
  SchemaFactory.createForClass(CrmSalesStrategy);
applyCrmSoftDeletePlugin(CrmSalesStrategySchema);
CrmSalesStrategySchema.index({ isDeleted: 1, deletedAt: -1 });

CrmSalesStrategySchema.index({ status: 1, updatedAt: -1 });
CrmSalesStrategySchema.index({ title: 'text', summary: 'text' });
CrmSalesStrategySchema.index({ authorizedUserIds: 1 });
