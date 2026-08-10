import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type WebsiteLeadDocument = WebsiteLead & Document;

@Schema({ timestamps: true, collection: 'crm_website_leads' })
export class WebsiteLead {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  company?: string;

  @Prop({ trim: true })
  subject?: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({
    type: String,
    enum: ['freelancer', 'agency', 'both'],
    default: 'both',
  })
  audience: string;

  @Prop({ trim: true, default: 'contact' })
  formType: string;

  @Prop({ trim: true })
  pageUrl?: string;

  @Prop({ trim: true })
  websiteHost?: string;

  @Prop({
    type: String,
    enum: ['new', 'in_progress', 'converted', 'spam'],
    default: 'new',
  })
  status: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  convertedLeadId?: Types.ObjectId;

  @Prop({ trim: true })
  utmSource?: string;

  @Prop({ trim: true })
  utmMedium?: string;

  @Prop({ trim: true })
  utmCampaign?: string;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  userAgent?: string;

  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;

}

export const WebsiteLeadSchema = SchemaFactory.createForClass(WebsiteLead);
applyCrmSoftDeletePlugin(WebsiteLeadSchema);
WebsiteLeadSchema.index({ isDeleted: 1, deletedAt: -1 });
WebsiteLeadSchema.index({ status: 1, createdAt: -1 });
WebsiteLeadSchema.index({ email: 1, createdAt: -1 });
WebsiteLeadSchema.index({ audience: 1, createdAt: -1 });
