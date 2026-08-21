import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password?: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop({ default: 'Employee' })
  role: string;

  @Prop({ type: Types.ObjectId, ref: 'UserRole' })
  roleId?: Types.ObjectId;

  /** True => user-level permissions override role template. */
  @Prop({ default: true })
  useRoleOverrides: boolean;

  @Prop()
  profileImage?: string;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ type: [String], default: ['HRMS'] })
  permittedTools: string[];

  @Prop({ type: [String], default: [] })
  crmPermissions: string[];

  @Prop({ type: [String], default: [] })
  pmProjects: string[];

  @Prop({ type: [String], default: [] })
  pmSpaces: string[];

  /** PM sidebar areas: boards:read, pm:read, wiki:read, workload:read, etc. */
  @Prop({ type: [String], default: [] })
  pmPermissions: string[];

  @Prop({ default: 0 })
  tokenVersion: number;

  @Prop({ default: 0 })
  accessVersion: number;

  @Prop()
  assignedLeadsPipeline?: string;

  @Prop({ type: [String], default: [] })
  accessibleEmailAccounts: string[];

  @Prop({ type: [String], default: [] })
  salesWorkspaceAccessibleEmployees: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Deal' }], default: [] })
  accessibleClientPortals: Types.ObjectId[];

  /**
   * Manager/Team Lead this user reports to (RBAC/workspace-isolation layer).
   * "My team" = this user + everyone whose reportsTo === this user's id.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  reportsTo?: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
