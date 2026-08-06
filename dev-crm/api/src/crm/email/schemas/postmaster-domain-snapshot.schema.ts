import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PostmasterDomainSnapshotDocument = PostmasterDomainSnapshot & Document;

@Schema({ timestamps: true })
export class PostmasterDomainSnapshot {
  @Prop({ required: true })
  domain: string;

  @Prop({ required: true })
  date: string;

  @Prop()
  domainReputation: string;

  @Prop({ type: Number, default: 0 })
  userReportedSpamRatio: number;

  @Prop({ type: Number, default: 0 })
  spfSuccessRatio: number;

  @Prop({ type: Number, default: 0 })
  dkimSuccessRatio: number;

  @Prop({ type: Number, default: 0 })
  dmarcSuccessRatio: number;

  @Prop({ type: Number, default: 0 })
  inboundEncryptionRatio: number;

  @Prop({ type: Number, default: 0 })
  outboundEncryptionRatio: number;

  @Prop({ type: [Object], default: [] })
  ipReputations: Record<string, any>[];

  @Prop({ type: [Object], default: [] })
  deliveryErrors: Record<string, any>[];

  @Prop({ type: Object })
  rawResponse: Record<string, any>;
}

export const PostmasterDomainSnapshotSchema = SchemaFactory.createForClass(
  PostmasterDomainSnapshot,
);

PostmasterDomainSnapshotSchema.index({ domain: 1, date: 1 }, { unique: true });
PostmasterDomainSnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });
