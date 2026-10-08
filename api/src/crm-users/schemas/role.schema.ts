import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CRM_ROLE_MODULES, CrmRoleModule } from '../../crm/shared/crm-workspace-module.util';

export type RoleDocument = Role & Document;

/**
 * KEEP IN SYNC with api/src/crm/crm-users/schemas/role.schema.ts — both register the `Role`
 * model on crmConnection and Mongoose compiles whichever loads first, so a field missing
 * from either copy silently disappears (workspaceModule did).
 */
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

  @Prop({ type: String, enum: [...CRM_ROLE_MODULES], default: 'ALL', index: true })
  workspaceModule: CrmRoleModule;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
