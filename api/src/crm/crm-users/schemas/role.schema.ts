import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CRM_ROLE_MODULES, CrmRoleModule } from '../../shared/crm-workspace-module.util';

export type RoleDocument = Role & Document;

@Schema({ timestamps: true })
export class Role {
  @Prop({ required: true, unique: true })
  name: string; // e.g., 'Admin', 'Sales Manager', 'Sales Rep'

  @Prop()
  description: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Permission' }] })
  permissions: Types.ObjectId[];

  @Prop({ default: false })
  isSystem: boolean; // System roles cannot be deleted

  /**
   * Workspace boundary (RBAC/workspace-isolation layer) — this is the field `RbacGuard`
   * actually reads (via `dbUser.roleId.workspaceModule`, `dbUser` being the live `CRMUser`
   * looked up at request time). Named distinctly from `Permission.module` (a different,
   * unrelated categorization: 'CRM'/'Users'/'Settings'). Defaults to 'ALL' (unrestricted)
   * so existing roles created before this field existed keep their current behavior.
   */
  @Prop({ enum: CRM_ROLE_MODULES, default: 'ALL', index: true })
  workspaceModule: CrmRoleModule;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
