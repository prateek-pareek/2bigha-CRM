import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRoleDocument = UserRole & Document;

@Schema({ timestamps: true })
export class UserRole {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ type: [String], default: [] })
  crmPermissions: string[];

  @Prop({ type: [String], default: [] })
  pmPermissions: string[];

  @Prop({ type: [String], default: [] })
  permittedTools: string[];

  @Prop({ type: [String], default: [] })
  dataScopes: string[];

  @Prop({ type: [String], default: [] })
  fieldPermissions: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const UserRoleSchema = SchemaFactory.createForClass(UserRole);
UserRoleSchema.index({ isActive: 1, name: 1 });

