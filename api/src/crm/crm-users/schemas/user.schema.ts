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

  @Prop({ type: [String], default: [] })
  accessibleEmailAccounts: string[];

  /** 2bigha-side admin/agent id once synced (see TwoBighaAgentService, createAdmin). Unset until a sync attempt succeeds. */
  @Prop({ trim: true, index: true })
  twobighaAdminId?: string;

  /** 'skipped' = no TWOBIGHA_DEFAULT_AGENT_ROLE_ID configured — createAdmin requires a 2bigha roleId. */
  @Prop({
    enum: ['not_synced', 'synced', 'mock', 'failed', 'skipped'],
    default: 'not_synced',
    index: true,
  })
  twobighaSyncStatus?: 'not_synced' | 'synced' | 'mock' | 'failed' | 'skipped';

  @Prop({ trim: true })
  twobighaSyncError?: string;

  @Prop()
  twobighaSyncedAt?: Date;

  @Prop({ trim: true, index: true })
  kommunoAgentId?: string;

  @Prop({
    enum: ['not_synced', 'synced', 'failed', 'skipped'],
    default: 'not_synced',
    index: true,
  })
  kommunoSyncStatus?: 'not_synced' | 'synced' | 'failed' | 'skipped';

  @Prop({ trim: true })
  kommunoSyncError?: string;

  @Prop()
  kommunoSyncedAt?: Date;

  @Prop({ trim: true })
  agentMobile?: string;

  @Prop({ default: '09:00' })
  agentInTime?: string;

  @Prop({ default: '18:00' })
  agentOutTime?: string;

  @Prop({ default: true })
  agentOutPermission?: boolean;

  @Prop({ default: false })
  agentMasking?: boolean;

  /** Stable HRMS employee code (Employee.employeeId). */
  @Prop({ trim: true, index: true, sparse: true, unique: true })
  hrmsEmployeeId?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ trim: true })
  designation?: string;

  @Prop({ trim: true })
  employmentStatus?: string;

  /** HRMS reportsTo employeeId — reference only; CRM owns team graph. */
  @Prop({ trim: true })
  hrmsReportsToEmployeeId?: string;

  /**
   * pending_access = synced from HRMS, not yet granted by CRM Admin (§2.3–2.4)
   * active = CRM Admin granted role/access
   * revoked = HRMS made ineligible or employment ended
   * hidden = Admin dismissed without delete
   */
  @Prop({
    enum: ['pending_access', 'active', 'revoked', 'hidden', 'manual'],
    default: 'manual',
    index: true,
  })
  provisioningStatus?:
    | 'pending_access'
    | 'active'
    | 'revoked'
    | 'hidden'
    | 'manual';

  @Prop({
    enum: ['not_synced', 'synced', 'failed'],
    default: 'not_synced',
    index: true,
  })
  hrmsSyncStatus?: 'not_synced' | 'synced' | 'failed';

  @Prop({ trim: true })
  hrmsSyncError?: string;

  @Prop()
  hrmsSyncedAt?: Date;

  @Prop({
    enum: ['available', 'unavailable_today'],
    default: 'available',
    index: true,
  })
  availabilityStatus?: 'available' | 'unavailable_today';

  /** Calendar date (YYYY-MM-DD) the availabilityStatus applies to. */
  @Prop({ trim: true, index: true })
  availabilityDate?: string;

  @Prop({ trim: true })
  availabilitySource?: string;

  @Prop({ trim: true })
  availabilityAttendanceStatus?: string;
}

export const CRMUserSchema = SchemaFactory.createForClass(CRMUser);
