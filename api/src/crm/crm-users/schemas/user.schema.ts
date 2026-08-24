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
}

export const CRMUserSchema = SchemaFactory.createForClass(CRMUser);
