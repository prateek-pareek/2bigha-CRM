import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProposalBrandingDocument = CrmProposalBranding & Document;

@Schema({ _id: false })
export class AgencyBrandingSubdoc {
  @Prop({ trim: true })
  companyName?: string;

  @Prop({ trim: true })
  tagline?: string;

  @Prop({ trim: true })
  logoUrl?: string;

  @Prop({ trim: true })
  addressLines?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  email?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  headerHtml?: string;

  @Prop({ trim: true })
  footerHtml?: string;
}

@Schema({ _id: false })
export class FreelancerBrandingSubdoc {
  @Prop({ trim: true })
  displayName?: string;

  @Prop({ trim: true })
  title?: string;

  @Prop({ trim: true })
  email?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  addressLines?: string;

  @Prop({ trim: true })
  headerHtml?: string;

  @Prop({ trim: true })
  footerHtml?: string;
}

@Schema({ timestamps: true, collection: 'crm_proposal_branding' })
export class CrmProposalBranding {
  @Prop({ type: Types.ObjectId, ref: 'CRMUser', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: AgencyBrandingSubdoc, default: {} })
  agency: AgencyBrandingSubdoc;

  @Prop({ type: FreelancerBrandingSubdoc, default: {} })
  freelancer: FreelancerBrandingSubdoc;
}

export const CrmProposalBrandingSchema =
  SchemaFactory.createForClass(CrmProposalBranding);
