import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UploadDocument = Upload & Document;

@Schema({ timestamps: true })
export class Upload {
  @Prop({ required: true, unique: true, index: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true, type: Buffer })
  data: Buffer;

  @Prop({ required: true })
  size: number;
}

export const UploadSchema = SchemaFactory.createForClass(Upload);
