import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientPortalAccessAssignmentDocument =
  ClientPortalAccessAssignment & Document;

@Schema({ timestamps: true })
export class ClientPortalAccessAssignment {
  @Prop({ type: Types.ObjectId, ref: 'Deal', required: true, index: true })
  deal: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  employeeId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['viewer', 'manager', 'portal_admin'],
    default: 'manager',
    index: true,
  })
  role: 'viewer' | 'manager' | 'portal_admin';

  @Prop({ default: true, index: true })
  active: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  grantedBy?: Types.ObjectId;
}

export const ClientPortalAccessAssignmentSchema = SchemaFactory.createForClass(
  ClientPortalAccessAssignment,
);
ClientPortalAccessAssignmentSchema.index(
  { deal: 1, employeeId: 1 },
  { unique: true },
);
