import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UploadDocument = Upload & Document;

/** Metadata for a file stored on local server disk (./uploads). The bytes
 *  themselves live on disk at `uploads/{filename}` — only metadata needed to
 *  serve/delete the file is kept here. */
@Schema({ timestamps: true })
export class Upload {
  @Prop({ required: true, unique: true, index: true })
  filename: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;
}

export const UploadSchema = SchemaFactory.createForClass(Upload);
