import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoleAuditLogDocument = RoleAuditLog & Document;

/**
 * Audit trail for the RBAC/workspace-isolation layer — every role, permission,
 * and ownership (lead/case reassignment) change gets logged here.
 */
@Schema({ timestamps: true })
export class RoleAuditLog {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  actorId?: Types.ObjectId;

  /** Denormalized so the audit log reads without a $lookup even if the actor is later deleted. */
  @Prop({ trim: true })
  actorLabel?: string;

  @Prop({
    required: true,
    enum: [
      'role_created',
      'role_updated',
      'role_deleted',
      'user_role_assigned',
      'ownership_changed',
    ],
    index: true,
  })
  action: string;

  /** e.g. 'UserRole' | 'User' | 'Lead' | 'LegalCase' */
  @Prop({ required: true, trim: true, index: true })
  targetType: string;

  @Prop({ type: Types.ObjectId, index: true })
  targetId?: Types.ObjectId;

  @Prop({ trim: true })
  targetLabel?: string;

  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;
}

export const RoleAuditLogSchema = SchemaFactory.createForClass(RoleAuditLog);
RoleAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
RoleAuditLogSchema.index({ createdAt: -1 });
