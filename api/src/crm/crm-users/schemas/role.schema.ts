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

  /** Plain `module:action` grants (legacy/import path) — merged with `permissions` by crmPermissionNamesFromRole. */
  @Prop({ type: [String], default: [] })
  crmPermissions: string[];

  @Prop({ default: true })
  isActive: boolean;

  /** `CRM_ROLE_SEEDS[].key` for the seeded functional roles (crm-role-catalog.ts). */
  @Prop({ index: true, sparse: true })
  seedKey?: string;

  /** `CRM_ROLE_SEED_VERSION` the stored permissions were last written from. */
  @Prop({ default: 0 })
  seedVersion: number;

  /**
   * Workspace boundary (RBAC/workspace-isolation layer) — this is the field `RbacGuard`
   * actually reads (via `dbUser.roleId.workspaceModule`, `dbUser` being the live `CRMUser`
   * looked up at request time). Named distinctly from `Permission.module` (a different,
   * unrelated categorization: 'CRM'/'Users'/'Settings'). Defaults to 'ALL' (unrestricted)
   * so existing roles created before this field existed keep their current behavior.
   */
  @Prop({ type: String, enum: [...CRM_ROLE_MODULES], default: 'ALL', index: true })
  workspaceModule: CrmRoleModule;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
