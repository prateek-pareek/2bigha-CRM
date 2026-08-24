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
  type: string; // 'webhook', 'api_key', 'whatsapp', etc.

  /** Stable catalog id when installed via the integrations marketplace. */
  @Prop({ index: true })
  providerId?: string;

  @Prop({ default: 'all' })
  module: string; // 'leads', 'contacts', 'all'

  @Prop({ type: Object, default: {} })
  config: Record<string, any>; // { webhookUrl: '...' }

  @Prop({ default: true })
  isActive: boolean;

  /**
   * Which WhatsApp send path the `type: 'whatsapp'` doc's `apiKey` (and
   * friends) belong to. 'meta' talks to the Graph API directly using
   * `phoneNumberId`/`businessAccountId`; 'aisensy' talks to AiSensy's
   * Campaign API using just `apiKey` (+ optional `sourceLabel`) — see
   * WhatsAppService and AiSensyClient. Only meaningful when `type ===
   * 'whatsapp'`; default 'meta' keeps existing configs working unchanged.
   */
  @Prop({ enum: ['meta', 'aisensy'], default: 'meta' })
  provider?: 'meta' | 'aisensy';

  /** Attribution tag sent as AiSensy's `source` field on every campaign send. */
  @Prop()
  sourceLabel?: string;

  /**
   * Meta App Secret (App Dashboard → Settings → Basic) — used to verify the
   * `X-Hub-Signature-256` header on inbound webhook POSTs so only genuine
   * Meta traffic is trusted. Shared shape across every Meta-backed
   * integration doc (`type: 'whatsapp'` and `type: 'meta-leadgen'` each keep
   * their own copy since they can be different Meta Apps); optional but
   * strongly recommended (see WhatsAppWebhookController / MetaLeadAdsWebhookController).
   */
  @Prop()
  appSecret?: string;

  /**
   * Facebook Page ID whose Lead Ads forms are synced into CRM Leads
   * (`type: 'meta-leadgen'` only). A Page Access Token is scoped to exactly
   * one page, so this doc only ever represents one.
   */
  @Prop()
  pageId?: string;

  /**
   * Long-lived Page Access Token (Graph API Explorer → select the Page →
   * generate + exchange for a long-lived token) used both to fetch full
   * lead details after a `leadgen` webhook fires and to list the page's Lead
   * Ads forms. `type: 'meta-leadgen'` only — distinct from WhatsApp's `apiKey`.
   */
  @Prop()
  pageAccessToken?: string;

  /**
   * Optional allow-list of Lead Ads Form IDs to sync (`type: 'meta-leadgen'`
   * only). Empty/unset means every lead form on `pageId` is synced. See
   * MetaLeadAdsService.processLeadgenEvent.
   */
  @Prop({ type: [String], default: [] })
  formIds?: string[];

  /**
   * Cached `{ id, name, status }` rows for the page's Lead Ads forms,
   * refreshed by MetaLeadAdsService.listForms() — lets the settings UI show
   * form names instead of raw IDs, and lets processed leads attribute a
   * human-readable form name to `Lead.source`.
   */
  @Prop({ type: [Object], default: [] })
  forms?: Array<{ id: string; name: string; status?: string }>;

  @Prop()
  formsSyncedAt?: Date;

  /**
   * Last time MetaLeadAdsPollingCronService successfully finished a polling
   * pass — drives the `since` window for the next pass (with a small
   * overlap; see MetaLeadAdsService.pollForNewLeads). `type: 'meta-leadgen'`
   * only.
   */
  @Prop()
  lastPolledAt?: Date;

  /**
   * AiSensy "Project API" credentials — a separate surface from the
   * Campaign API (`apiKey` above): it's the only confirmed way to send a
   * free-text/session WhatsApp message via AiSensy. Both optional; without
   * them, free-text sends stay disabled for the aisensy provider and only
   * template/campaign sends work. See AiSensyClient.sendSessionMessage().
   */
  @Prop()
  aisensyProjectId?: string;

  @Prop()
  aisensyProjectApiPassword?: string;

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
