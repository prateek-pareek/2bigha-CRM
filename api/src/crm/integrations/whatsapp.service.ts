import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhatsAppMessage,
  WhatsAppMessageDocument,
} from '../schemas/whatsapp-message.schema';
import { Integration } from '../schemas/integration.schema';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AiSensyClient } from './aisensy-client.util';

const META_API = 'https://graph.facebook.com/v18.0';

export type WhatsAppTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  example?: Record<string, any>;
  buttons?: Array<Record<string, any>>;
};

export type WhatsAppCachedTemplate = {
  id?: string;
  name: string;
  status: string;
  language: string;
  category?: string;
  components?: WhatsAppTemplateComponent[];
};

export type WhatsAppTemplateSendComponent = {
  type: string;
  sub_type?: string;
  index?: string | number;
  parameters?: Array<{
    type: string;
    text?: string;
    [key: string]: any;
  }>;
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectModel(WhatsAppMessage.name, 'crmConnection')
    private messageModel: Model<WhatsAppMessageDocument>,
    @InjectModel(Integration.name, 'crmConnection')
    private integrationModel: Model<any>,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Pushes a live update to every connected CRM user (the 'ALL' room every
   * client joins on connect — see RealtimeManager.tsx) so the WhatsApp chat
   * UI can update instantly instead of waiting on its poll interval. Mirrors
   * the `deal-chat:message` / `crm:inbox:refresh` pattern used elsewhere.
   */
  private emitWhatsAppEvent(waId: string, message: WhatsAppMessageDocument): void {
    try {
      this.realtimeGateway.server
        ?.to('ALL')
        .emit('whatsapp:message', { waId, message });
    } catch (e: any) {
      this.logger.error(`WhatsApp realtime emit error: ${e?.message}`);
    }
  }

  private async getConfig(): Promise<{
    apiKey: string;
    phoneNumberId: string;
    businessAccountId?: string;
    provider: 'meta' | 'aisensy';
    sourceLabel?: string;
    aisensyProjectId?: string;
    aisensyProjectApiPassword?: string;
  } | null> {
    const config = await this.integrationModel
      .findOne({ type: 'whatsapp' })
      .lean()
      .exec();
    if (!config?.apiKey || !config?.isActive) return null;
    const provider: 'meta' | 'aisensy' =
      config.provider === 'aisensy' ? 'aisensy' : 'meta';
    // phoneNumberId only matters for the Meta path.
    if (provider === 'meta' && !config.phoneNumberId) return null;
    return {
      apiKey: config.apiKey,
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId
        ? String(config.businessAccountId)
        : undefined,
      provider,
      sourceLabel: config.sourceLabel ? String(config.sourceLabel) : undefined,
      aisensyProjectId: config.aisensyProjectId
        ? String(config.aisensyProjectId)
        : undefined,
      aisensyProjectApiPassword: config.aisensyProjectApiPassword
        ? String(config.aisensyProjectApiPassword)
        : undefined,
    };
  }

  /**
   * Flattens Meta-style template `components` (the shape
   * `sendTemplateMessage` accepts and the inbox's template picker builds via
   * `buildComponents()`) into the plain ordered `templateParams: string[]`
   * AiSensy's Campaign API expects — i.e. every BODY/HEADER component's
   * `parameters[].text`, in order.
   */
  private flattenParamsForAiSensy(
    components?: WhatsAppTemplateSendComponent[],
  ): string[] {
    const out: string[] = [];
    for (const component of components || []) {
      for (const param of component.parameters || []) {
        if (typeof param?.text === 'string') out.push(param.text);
      }
    }
    return out;
  }

  async sendMessage(
    to: string,
    body: string,
    userId?: string,
    module?: string,
    entityId?: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const config = await this.getConfig();
    if (!config)
      return { success: false, error: 'WhatsApp not configured or inactive' };

    const phone = to.replace(/\D/g, '');
    if (phone.length < 10)
      return { success: false, error: 'Invalid phone number' };

    if (config.provider === 'aisensy') {
      // Free-text sends go through AiSensy's separate Project API, which
      // needs its own projectId/projectApiPassword credential pair (see
      // AiSensyClient.sendSessionMessage's doc comment). Without those
      // configured, fall back to the old template-only guidance.
      if (!config.aisensyProjectId || !config.aisensyProjectApiPassword) {
        return {
          success: false,
          error:
            "Free-text replies need AiSensy's Project API credentials — add a Project ID and Project API Password under Settings → Integrations → WhatsApp, or send a template message instead.",
        };
      }

      const client = new AiSensyClient(config.apiKey, {
        projectId: config.aisensyProjectId,
        projectApiPassword: config.aisensyProjectApiPassword,
      });
      const result = await client.sendSessionMessage({ destination: phone, body });
      if (!result.success) {
        this.logger.error(`AiSensy session send failed: ${result.error}`);
        return { success: false, error: result.error || 'Send failed' };
      }

      const msgId = result.raw?.messages?.[0]?.id
        ? String(result.raw.messages[0].id)
        : undefined;
      const saved = await this.messageModel.create({
        waId: phone,
        direction: 'outbound',
        body,
        messageId: msgId,
        sentBy: userId ? new Types.ObjectId(userId) : undefined,
        module,
        entityId: entityId ? new Types.ObjectId(entityId) : undefined,
        status: 'sent',
        meta: { ...result.raw, provider: 'aisensy' },
      });
      this.emitWhatsAppEvent(phone, saved);
      return { success: true, messageId: msgId };
    }

    try {
      const res = await fetch(`${META_API}/${config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { body },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(`WhatsApp send failed: ${JSON.stringify(data)}`);
        return {
          success: false,
          error:
            data?.error?.message ||
            data?.error?.error_user_msg ||
            'Send failed',
        };
      }

      const msgId = data?.messages?.[0]?.id;
      const saved = await this.messageModel.create({
        waId: phone,
        direction: 'outbound',
        body,
        messageId: msgId,
        sentBy: userId ? new Types.ObjectId(userId) : undefined,
        module,
        entityId: entityId ? new Types.ObjectId(entityId) : undefined,
        status: 'sent',
        meta: data,
      });
      this.emitWhatsAppEvent(phone, saved);

      return { success: true, messageId: msgId };
    } catch (e: any) {
      this.logger.error(`WhatsApp send error: ${e?.message}`);
      return { success: false, error: e?.message || 'Send failed' };
    }
  }

  async sendTemplateMessage(params: {
    to: string;
    name: string;
    language: string;
    components?: WhatsAppTemplateSendComponent[];
    bodyPreview?: string;
    userId?: string;
    module?: string;
    entityId?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const config = await this.getConfig();
    if (!config)
      return { success: false, error: 'WhatsApp not configured or inactive' };

    const phone = params.to.replace(/\D/g, '');
    if (phone.length < 10)
      return { success: false, error: 'Invalid phone number' };

    const templateName = String(params.name || '').trim();
    const language = String(params.language || '').trim();
    if (!templateName || !language) {
      return { success: false, error: 'Template name and language are required' };
    }

    if (config.provider === 'aisensy') {
      // For AiSensy, `params.name` is expected to be the AiSensy dashboard
      // Campaign name this template maps to (WhatsAppTemplate.aisensyCampaignName)
      // — see AiSensyClient's doc comment for why there's no template-id
      // lookup here.
      const client = new AiSensyClient(config.apiKey);
      const result = await client.sendCampaignMessage({
        destination: phone,
        campaignName: templateName,
        source: config.sourceLabel,
        templateParams: this.flattenParamsForAiSensy(params.components),
      });

      const body =
        String(params.bodyPreview || '').trim() ||
        `[Template] ${templateName} (${language})`;

      if (!result.success) {
        this.logger.error(`AiSensy template send failed: ${result.error}`);
        return { success: false, error: result.error || 'Template send failed' };
      }

      const msgId = result.raw?.messageId ? String(result.raw.messageId) : undefined;
      const saved = await this.messageModel.create({
        waId: phone,
        direction: 'outbound',
        body,
        messageId: msgId,
        sentBy: params.userId ? new Types.ObjectId(params.userId) : undefined,
        module: params.module,
        entityId: params.entityId
          ? new Types.ObjectId(params.entityId)
          : undefined,
        status: 'sent',
        meta: {
          ...result.raw,
          provider: 'aisensy',
          template: { name: templateName, language, components: params.components || [] },
        },
      });
      this.emitWhatsAppEvent(phone, saved);
      return { success: true, messageId: msgId };
    }

    try {
      const res = await fetch(`${META_API}/${config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: language },
            ...(params.components?.length
              ? { components: params.components }
              : {}),
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(
          `WhatsApp template send failed: ${JSON.stringify(data)}`,
        );
        return {
          success: false,
          error:
            data?.error?.message ||
            data?.error?.error_user_msg ||
            'Template send failed',
        };
      }

      const msgId = data?.messages?.[0]?.id;
      const body =
        String(params.bodyPreview || '').trim() ||
        `[Template] ${templateName} (${language})`;

      const saved = await this.messageModel.create({
        waId: phone,
        direction: 'outbound',
        body,
        messageId: msgId,
        sentBy: params.userId ? new Types.ObjectId(params.userId) : undefined,
        module: params.module,
        entityId: params.entityId
          ? new Types.ObjectId(params.entityId)
          : undefined,
        status: 'sent',
        meta: {
          ...data,
          template: {
            name: templateName,
            language,
            components: params.components || [],
          },
        },
      });
      this.emitWhatsAppEvent(phone, saved);

      return { success: true, messageId: msgId };
    } catch (e: any) {
      this.logger.error(`WhatsApp template send error: ${e?.message}`);
      return { success: false, error: e?.message || 'Template send failed' };
    }
  }

  async listTemplates(options: {
    refresh?: boolean;
  } = {}): Promise<{
    templates: WhatsAppCachedTemplate[];
    syncedAt?: string | null;
    error?: string;
  }> {
    if (options.refresh) {
      const synced = await this.syncTemplates();
      if (!synced.success) {
        return {
          templates: synced.templates || [],
          syncedAt: synced.syncedAt || null,
          error: synced.error,
        };
      }
      return {
        templates: synced.templates || [],
        syncedAt: synced.syncedAt || null,
      };
    }

    const doc = await this.integrationModel
      .findOne({ type: 'whatsapp' })
      .lean()
      .exec();
    const templates = Array.isArray(doc?.templates) ? doc.templates : [];
    return {
      templates,
      syncedAt: doc?.templatesSyncedAt
        ? new Date(doc.templatesSyncedAt).toISOString()
        : null,
    };
  }

  async syncTemplates(): Promise<{
    success: boolean;
    templates?: WhatsAppCachedTemplate[];
    syncedAt?: string;
    error?: string;
  }> {
    const config = await this.getConfig();
    if (!config) {
      return { success: false, error: 'WhatsApp not configured or inactive' };
    }
    if (config.provider === 'aisensy') {
      return {
        success: false,
        error:
          "AiSensy doesn't expose a public template-list API — manage & approve templates in the AiSensy dashboard, then map each one to a Campaign name under Settings → WhatsApp templates.",
      };
    }
    if (!config.businessAccountId) {
      return {
        success: false,
        error:
          'Business Account ID (WABA) is required to sync templates. Add it in WhatsApp integration settings.',
      };
    }

    try {
      const templates: WhatsAppCachedTemplate[] = [];
      let url: string | null =
        `${META_API}/${config.businessAccountId}/message_templates` +
        `?fields=name,status,language,category,components,id&limit=100`;

      while (url) {
        const res: Response = await fetch(url, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.logger.error(
            `WhatsApp template sync failed: ${JSON.stringify(data)}`,
          );
          return {
            success: false,
            error:
              data?.error?.message ||
              data?.error?.error_user_msg ||
              'Failed to sync templates from Meta',
          };
        }

        const page = Array.isArray(data?.data) ? data.data : [];
        for (const row of page) {
          templates.push({
            id: row.id ? String(row.id) : undefined,
            name: String(row.name || ''),
            status: String(row.status || ''),
            language: String(row.language || ''),
            category: row.category ? String(row.category) : undefined,
            components: Array.isArray(row.components) ? row.components : [],
          });
        }

        url = data?.paging?.next ? String(data.paging.next) : null;
      }

      const syncedAt = new Date();
      await this.integrationModel.updateOne(
        { type: 'whatsapp' },
        {
          $set: {
            templates,
            templatesSyncedAt: syncedAt,
          },
        },
      );

      return {
        success: true,
        templates,
        syncedAt: syncedAt.toISOString(),
      };
    } catch (e: any) {
      this.logger.error(`WhatsApp template sync error: ${e?.message}`);
      return {
        success: false,
        error: e?.message || 'Failed to sync templates',
      };
    }
  }

  /**
   * Applies a delivery/read/failed receipt from the provider's webhook to
   * the previously-saved outbound message (matched by `messageId`) and
   * pushes a realtime update so the inbox's tick marks refresh live.
   * `status` is normalized to the schema's enum — an unrecognized value is
   * logged and dropped rather than persisted, so a provider quirk can't
   * silently poison the field with junk.
   */
  async updateMessageStatus(
    messageId: string,
    status: string,
    meta?: Record<string, any>,
  ): Promise<void> {
    const normalized = String(status || '').toLowerCase();
    if (!['sent', 'delivered', 'read', 'failed'].includes(normalized)) {
      this.logger.warn(`Ignoring unrecognized WhatsApp status "${status}" for ${messageId}`);
      return;
    }

    const message = await this.messageModel.findOne({ messageId }).exec();
    if (!message) return; // status update for a message we don't have (or an inbound echo)

    // Never downgrade — a late/out-of-order 'sent' receipt shouldn't
    // overwrite an already-recorded 'delivered'/'read'.
    const rank = { sent: 0, delivered: 1, read: 2, failed: 3 } as const;
    if ((rank[message.status as keyof typeof rank] ?? 0) > rank[normalized as keyof typeof rank]) {
      return;
    }

    message.status = normalized;
    if (meta) message.meta = { ...(message.meta || {}), lastStatusEvent: meta };
    await message.save();
    this.emitWhatsAppEvent(message.waId, message);
  }

  async saveIncoming(
    waId: string,
    body: string,
    messageId: string,
  ): Promise<void> {
    const saved = await this.messageModel.create({
      waId,
      direction: 'inbound',
      body,
      messageId,
      status: 'delivered',
    });
    this.emitWhatsAppEvent(waId, saved);
  }

  async getConversations(
    options: { waId?: string; page?: number; pageSize?: number } = {},
  ): Promise<{ messages: WhatsAppMessage[]; total: number }> {
    const filter: any = {};
    if (options.waId) filter.waId = options.waId;
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [messages, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('sentBy', 'firstName lastName')
        .lean()
        .exec(),
      this.messageModel.countDocuments(filter),
    ]);

    return { messages, total };
  }

  async getUniqueContacts(): Promise<{ waId: string; lastMessageAt: Date }[]> {
    const agg = await this.messageModel
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$waId', lastMessageAt: { $first: '$createdAt' } } },
        { $project: { waId: '$_id', lastMessageAt: 1, _id: 0 } },
        { $sort: { lastMessageAt: -1 } },
      ])
      .exec();
    return agg;
  }
}
