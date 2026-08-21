import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CRM_ROLE_MODULES, CrmRoleModule } from '../../crm/shared/crm-workspace-module.util';

export type UserRoleDocument = UserRole & Document;

@Schema({ timestamps: true })
export class UserRole {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  /**
   * Workspace this role belongs to (RBAC/workspace-isolation layer). 'ALL' (Super Admin
   * style roles) bypasses the module-boundary check. Defaults to 'ALL' so roles created
   * before this field existed keep their current (unrestricted) behavior.
   */
  @Prop({ enum: CRM_ROLE_MODULES, default: 'ALL', index: true })
  module: CrmRoleModule;

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

