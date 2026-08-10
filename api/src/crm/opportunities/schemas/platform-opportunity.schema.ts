import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type PlatformOpportunityDocument = PlatformOpportunity & Document;

@Schema({ timestamps: true, collection: 'platformopportunities' })
export class PlatformOpportunity {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true, index: true })
  opportunitySourcePlatform: string;

  @Prop({ trim: true })
  opportunityListingUrl?: string;

  @Prop({ trim: true })
  platformClientLabel?: string;

  @Prop({ type: Types.ObjectId, ref: 'Pipeline', index: true })
  pipeline?: Types.ObjectId;

  /** Stage name within the selected pipeline (same pattern as leads). */
  @Prop({ trim: true, index: true })
  stage?: string;

  @Prop({
    default: 'saved',
    enum: [
      'saved',
      'applied',
      'messaged',
      'interview',
      'hired',
      'rejected',
      'withdrawn',
      'no_response',
    ],
  })
  platformEngagementStatus: string;

  @Prop()
  platformLastEngagedAt?: Date;

  @Prop()
  notes?: string;

  /** Social post URL (LinkedIn, Threads, Facebook) or other lead source text. */
  @Prop({ trim: true })
  source?: string;

  @Prop({ type: Object })
  sourceMetadata?: {
    title?: string;
    description?: string;
    image?: string;
    authorName?: string;
    authorPhoto?: string;
    authorHandle?: string;
    type?: 'linkedin' | 'threads' | 'facebook' | 'generic';
    url: string;
  };

  @Prop({ index: true })
  ownerLabel?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  @Prop({ trim: true, sparse: true, unique: true })
  recordId?: string;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const PlatformOpportunitySchema =
  SchemaFactory.createForClass(PlatformOpportunity);
applyCrmSoftDeletePlugin(PlatformOpportunitySchema);
PlatformOpportunitySchema.index({ isDeleted: 1, deletedAt: -1 });

PlatformOpportunitySchema.index({ createdAt: -1 });
PlatformOpportunitySchema.index({ ownerLabel: 1, createdAt: -1 });
PlatformOpportunitySchema.index({ platformEngagementStatus: 1, createdAt: -1 });
PlatformOpportunitySchema.index({ pipeline: 1, createdAt: -1 });
PlatformOpportunitySchema.index({ pipeline: 1, stage: 1, createdAt: -1 });
PlatformOpportunitySchema.index(
  {
    title: 'text',
    opportunitySourcePlatform: 'text',
    platformClientLabel: 'text',
  },
  {
    name: 'platform_opportunity_global_search_text',
    weights: { title: 10, platformClientLabel: 6, opportunitySourcePlatform: 4 },
  },
);
