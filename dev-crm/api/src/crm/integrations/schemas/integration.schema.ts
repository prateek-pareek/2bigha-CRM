import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type IntegrationDocument = Integration & Document;

export type IntegrationAuthType =
  | 'oauth'
  | 'api_key'
  | 'webhook'
  | 'manual';

export type IntegrationConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'pending';

@Schema({ timestamps: true, strict: false })
export class Integration {
  @Prop()
  name: string; // 'Microsoft Teams', 'WhatsApp', etc.

  @Prop({ required: true })
  type: string; // 'webhook', 'api_key', 'whatsapp', 'google_postmaster', etc.

  /** Stable catalog id when installed via the integrations marketplace. */
  @Prop({ index: true })
  providerId?: string;

  @Prop({ default: 'all' })
  module: string; // 'leads', 'deals', 'contacts', 'all'

  @Prop({ type: Object, default: {} })
  config: Record<string, any>; // { webhookUrl: '...' }

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    enum: ['oauth', 'api_key', 'webhook', 'manual'],
  })
  authType?: IntegrationAuthType;

  @Prop({
    enum: ['connected', 'disconnected', 'error', 'pending'],
    default: 'disconnected',
  })
  status?: IntegrationConnectionStatus;

  @Prop()
  connectedAt?: Date;

  @Prop()
  lastHealthAt?: Date;

  @Prop()
  lastError?: string;

  @Prop()
  installedBy?: string;
}

export const IntegrationSchema = SchemaFactory.createForClass(Integration);
IntegrationSchema.index({ providerId: 1, type: 1 });
