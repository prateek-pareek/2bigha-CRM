import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PermissionDocument = Permission & Document;

@Schema({ timestamps: true })
export class Permission {
  @Prop({ required: true, unique: true })
  name: string; // e.g., 'leads:read', 'leads:write', 'deals:delete'

  @Prop()
  description: string;

  @Prop({ required: true })
  module: string; // e.g., 'CRM', 'Users', 'Settings'
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
