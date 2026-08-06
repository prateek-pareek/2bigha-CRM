import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserConfigDocument = UserConfig & Document;

@Schema({ timestamps: true })
export class UserConfig {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({
    type: [
      {
        id: String,
        type: { type: String, enum: ['chart', 'card', 'table'] },
        component: String,
        title: String,
        layout: {
          x: Number,
          y: Number,
          w: Number,
          h: Number,
        },
        isVisible: { type: Boolean, default: true },
        props: { type: Object, default: {} },
      },
    ],
    default: [],
  })
  dashboardLayout: any[];

  @Prop({
    type: [
      {
        id: String,
        name: String,
        config: Object,
      },
    ],
    default: [],
  })
  savedReports: any[];

  @Prop({
    type: [
      {
        id: String,
        type: { type: String, enum: ['chart', 'card', 'table'] },
        component: String,
        title: String,
        layout: {
          x: Number,
          y: Number,
          w: Number,
          h: Number,
        },
        isVisible: { type: Boolean, default: true },
        props: { type: Object, default: {} },
      },
    ],
    default: [],
  })
  reportLayout: any[];
}

export const UserConfigSchema = SchemaFactory.createForClass(UserConfig);
