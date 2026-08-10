import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TrashDocument = Trash & Document;

@Schema({ timestamps: true })
export class Trash {
  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true })
  collectionName: string; // 'Employee', 'Project', 'Issue', 'PMUser', 'CRMUser'

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  data: any;

  @Prop({ required: true })
  deletedBy: string; // email or ID

  @Prop({ default: Date.now })
  deletedAt: Date;
}

export const TrashSchema = SchemaFactory.createForClass(Trash);
