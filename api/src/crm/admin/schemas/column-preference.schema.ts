import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ColumnPreferenceDocument = ColumnPreference & Document;

@Schema({ timestamps: true })
export class ColumnPreference {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  module: string; // 'leads', 'deals', 'contacts', 'organizations'

  @Prop({ type: [String], required: true })
  columns: string[]; // List of field keys to display
}

export const ColumnPreferenceSchema =
  SchemaFactory.createForClass(ColumnPreference);
