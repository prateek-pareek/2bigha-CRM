import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CRMUserDocument = CRMUser & Document;

@Schema({ timestamps: true })
export class CRMUser {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password?: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop({ type: Types.ObjectId, ref: 'Role' })
  roleId?: Types.ObjectId;

  @Prop({ default: 'user' }) // 'admin' | 'user' - kept for compatibility during transition
  role: string;

  @Prop({ type: [String], default: [] })
  permissions?: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLogin?: Date;

  @Prop()
  assignedLeadsPipeline?: string;

  @Prop()
  assignedDealsPipeline?: string;

  @Prop({ type: [String], default: [] })
  accessibleEmailAccounts: string[];
}

export const CRMUserSchema = SchemaFactory.createForClass(CRMUser);
