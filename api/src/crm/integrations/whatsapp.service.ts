import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhatsAppMessage,
  WhatsAppMessageDocument,
} from '../schemas/whatsapp-message.schema';
import { Integration } from '../schemas/integration.schema';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { AiSensyClient } from './aisensy-client.util';
import { StorageService } from '../../storage/storage.service';
import { resolvePublicMediaUrl } from '../../storage/media-url.util';
import { Lead } from '../schemas/lead.schema';
import { WhatsAppLeadLink } from '../whatsapp-links/schemas/whatsapp-lead-link.schema';
import { CRMUser } from '../crm-users/schemas/user.schema';
import { hasCrmFullDataAccess } from '../shared/crm-admin-access.util';

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
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<any>,
    @InjectModel(WhatsAppLeadLink.name, 'crmConnection')
    private linkModel: Model<any>,
    @InjectModel(CRMUser.name, 'crmConnection')
    private crmUserModel: Model<any>,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Pushes a live update to every connected CRM user (the 'ALL' room every
   * client joins on connect — see RealtimeManager.tsx) so the WhatsApp chat
   * UI can update instantly instead of waiting on its poll interval. Mirrors
   * the `crm:inbox:refresh` pattern used elsewhere.
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
    aisensyPropertyShareCampaign?: string;
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
      aisensyPropertyShareCampaign: config.aisensyPropertyShareCampaign
        ? String(config.aisensyPropertyShareCampaign)
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

  private async validateSendAccess(waId: string, userIdStr?: string): Promise<void> {
    if (!userIdStr) return; // System processes or cron jobs can send
    const user = await this.crmUserModel.findById(userIdStr).populate('roleId').lean().exec();
    if (!user) return;

    if (hasCrmFullDataAccess(user)) {
      return; // Admins can always send
    }

    const userId = this.userObjectId(user);
    if (!userId) return;

    // Check if they are forbidden to access the chat completely first
    const forbidden = await this.getUserForbiddenWaIds(user);
    if (forbidden && forbidden.includes(waId)) {
      throw new ForbiddenException('You do not have access to this chat');
    }

    // Check if the chat has a temporary grant for this user, and what type it is
    const normalizedWaId = String(waId || '').replace(/\D/g, '');
    const link = await this.linkModel.findOne({ waId: normalizedWaId }).lean().exec();
    if (link && link.temporaryGrants) {
      const activeGrant = link.temporaryGrants.find(
        (g: any) =>
          String(g.userId) === String(userId) &&
          new Date(g.expiresAt) > new Date()
      );
      if (activeGrant && activeGrant.accessType === 'read') {
        throw new ForbiddenException('You only have read-only temporary access to this chat');
      }
    }
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

    await this.validateSendAccess(phone, userId);

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
        isRead: true,
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
        isRead: true,
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
    mediaUrl?: string;
    mediaFilename?: string;
    /** Media recorded against the chat when this template has a header attachment. */
    mediaType?: 'image' | 'document' | 'video' | 'audio';
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const config = await this.getConfig();
    if (!config)
      return { success: false, error: 'WhatsApp not configured or inactive' };

    const phone = params.to.replace(/\D/g, '');
    if (phone.length < 10)
      return { success: false, error: 'Invalid phone number' };

    await this.validateSendAccess(phone, params.userId);

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
        media: params.mediaUrl ? {
          url: params.mediaUrl,
          filename: params.mediaFilename || 'file'
        } : undefined,
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
        isRead: true,
        attachment: params.mediaUrl ? {
          type: params.mediaType || 'image',
          url: params.mediaUrl,
          filename: params.mediaFilename
        } : undefined,
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
        isRead: true,
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
      if (!config.aisensyProjectId || !config.aisensyProjectApiPassword) {
        return {
          success: false,
          error: 'AiSensy Project ID and Project API Password are required to sync templates.',
        };
      }
      try {
        const templates: WhatsAppCachedTemplate[] = [];
        let hasMore = true;
        let after: string | undefined = undefined;

        const reverseLanguageMap: Record<string, string> = {
          'english': 'en',
          'english (us)': 'en_US',
          'english (uk)': 'en_GB',
          'hindi': 'hi',
          'spanish': 'es',
          'portuguese': 'pt',
        };

        while (hasMore) {
          let url = `https://apis.aisensy.com/project-apis/v1/project/${config.aisensyProjectId}/wa_template?limit=100`;
          if (after) url += `&after=${after}`;
          
          const res = await fetch(url, {
            headers: {
              'Accept': 'application/json',
              'X-AiSensy-Project-API-Pwd': config.aisensyProjectApiPassword || '',
            }
          });
          const data: any = await res.json().catch(() => ({}));
          if (!res.ok) {
            const errorMessage = data?.message || data?.error || 'Failed to sync templates from AiSensy';
            this.logger.error(`AiSensy template sync failed: ${JSON.stringify(data)}`);
            return { success: false, error: errorMessage };
          }

          const page = Array.isArray(data?.template) ? data.template : [];
          for (const row of page) {
            const langLower = String(row.language || '').toLowerCase();
            const language = reverseLanguageMap[langLower] || langLower.substring(0, 2);

            const components: any[] = [];
            components.push({
              type: 'BODY',
              text: row.text || '',
              example: row.sample_text && row.sample_text !== row.text ? {
                body_text: [
                  (row.sample_text.match(/\[(.*?)\]/g) || []).map((v: string) => v.slice(1, -1))
                ]
              } : undefined
            });

            if (row.footer_text) {
              components.push({ type: 'FOOTER', text: row.footer_text });
            }

            if (row.header_text) {
              components.push({ type: 'HEADER', format: 'TEXT', text: row.header_text });
            } else if (['IMAGE', 'VIDEO', 'FILE', 'LOCATION'].includes(row.type)) {
              components.push({ type: 'HEADER', format: row.type === 'FILE' ? 'DOCUMENT' : row.type });
            }

            if (Array.isArray(row.buttons) && row.buttons.length > 0) {
              components.push({
                type: 'BUTTONS',
                buttons: row.buttons.map((b: any) => ({
                  type: b.type === 'Phone Number' ? 'PHONE_NUMBER' : (b.type === 'URL' ? 'URL' : 'QUICK_REPLY'),
                  text: b.button_title || b.text || '',
                  url: b.type === 'URL' ? b.button_value : undefined,
                  phone_number: b.type === 'Phone Number' ? b.button_value : undefined,
                }))
              });
            }

            templates.push({
              id: row.template_id || row.id || undefined,
              name: String(row.name || ''),
              status: String(row.status || ''),
              language,
              category: row.category ? String(row.category) : undefined,
              components,
            });
          }

          if (page.length < 100) {
            hasMore = false;
          } else {
            after = page[page.length - 1].id;
          }
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
        this.logger.error(`AiSensy template sync error: ${e?.message}`);
        return { success: false, error: e?.message || 'Failed to sync templates' };
      }
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
    attachment?: {
      type: 'image' | 'document' | 'video' | 'audio';
      url: string;
      filename?: string;
    },
  ): Promise<void> {
    const saved = await this.messageModel.create({
      waId,
      direction: 'inbound',
      body,
      messageId,
      status: 'delivered',
      isRead: false,
      attachment,
    });
    this.emitWhatsAppEvent(waId, saved);
  }

  async saveOutgoingWebhook(
    waId: string,
    body: string,
    messageId: string,
    attachment?: {
      type: 'image' | 'document' | 'video' | 'audio';
      url: string;
      filename?: string;
    },
  ): Promise<void> {
    const existing = await this.messageModel.findOne({ messageId }).exec();
    if (existing) return;
    const saved = await this.messageModel.create({
      waId,
      direction: 'outbound',
      body,
      messageId,
      status: 'sent',
      isRead: true,
      attachment,
    });
    this.emitWhatsAppEvent(waId, saved);
  }

  private repOwnerLabelFromUser(user?: any): string {
    if (!user) return 'Unknown';
    const fn = String(user.firstName || '').trim();
    const ln = String(user.lastName || '').trim();
    const n = [fn, ln].filter(Boolean).join(' ');
    if (n) return n;
    const email = String(user.email || '').trim();
    return email;
  }

  private userObjectId(user?: any): Types.ObjectId | null {
    const raw = user?._id || user?.userId || null;
    if (!raw) return null;
    return Types.ObjectId.isValid(String(raw)) ? new Types.ObjectId(String(raw)) : null;
  }

  async getUserForbiddenWaIds(user: any): Promise<string[] | null> {
    if (!user || hasCrmFullDataAccess(user)) {
      return null; // Null means they can access everything (no isolation)
    }

    const userId = this.userObjectId(user);
    const ownerName = this.repOwnerLabelFromUser(user).trim();

    // 1. Find all Lead IDs that this user owns/has access to (explicit permissions)
    const leadFilters: any[] = [];
    if (ownerName) {
      leadFilters.push({ leadOwner: ownerName });
    }
    if (userId) {
      leadFilters.push({ createdBy: userId });
      leadFilters.push({ sharedWith: userId });
      leadFilters.push({ leadOwner: String(userId) });
    }

    let allowedLeadIds: Types.ObjectId[] = [];
    if (leadFilters.length > 0) {
      const leads = await this.leadModel
        .find({ $or: leadFilters })
        .select('_id')
        .lean()
        .exec();
      allowedLeadIds = leads.map((l) => l._id);
    }

    // 2. Query all links that have active temporary grants for this user.
    // These chats should NOT be forbidden for this user.
    let activeGrantWaIds: string[] = [];
    if (userId) {
      const linksWithGrants = await this.linkModel
        .find({
          temporaryGrants: {
            $elemMatch: {
              userId,
              expiresAt: { $gt: new Date() },
            },
          },
        })
        .select('waId')
        .lean()
        .exec();
      activeGrantWaIds = linksWithGrants.map((l) => l.waId);
    }

    // 3. Find all chats linked to leads NOT owned by this user, where they aren't the assignee,
    // and where they don't have an active temporary grant.
    const forbiddenLinksQuery: any = {
      leadId: { $exists: true, $ne: null },
    };

    if (allowedLeadIds.length > 0) {
      forbiddenLinksQuery.leadId = { $nin: allowedLeadIds };
    }
    if (userId) {
      forbiddenLinksQuery.assignee = { $ne: userId };
    }
    if (activeGrantWaIds.length > 0) {
      forbiddenLinksQuery.waId = { $nin: activeGrantWaIds };
    }

    const forbiddenLinks = await this.linkModel
      .find(forbiddenLinksQuery)
      .select('waId')
      .lean()
      .exec();

    return forbiddenLinks.map((l) => l.waId);
  }

  async grantTemporaryAccess(
    waId: string,
    targetUserId: string,
    accessType: 'read' | 'read_write',
    durationMinutes: number,
    actorId?: string,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('A valid target user is required');
    }
    const expiresAt = new Date(Date.now() + durationMinutes * 60000);

    // Make sure the chat link exists, otherwise upsert/create one
    const normalizedWaId = String(waId || '').replace(/\D/g, '');
    if (normalizedWaId.length < 10) {
      throw new BadRequestException('A valid phone number is required');
    }

    // Push the new grant to temporaryGrants array
    const grant = {
      userId: new Types.ObjectId(targetUserId),
      accessType,
      expiresAt,
    };

    // First remove any existing temporary grants for this user in this chat to avoid duplicates
    await this.linkModel.updateOne(
      { waId: normalizedWaId },
      { $pull: { temporaryGrants: { userId: grant.userId } } }
    ).exec();

    const link = await this.linkModel.findOneAndUpdate(
      { waId: normalizedWaId },
      {
        $set: { waId: normalizedWaId },
        $push: { temporaryGrants: grant },
      },
      { upsert: true, new: true }
    ).exec();

    return link;
  }

  async getConversations(
    options: { waId?: string; page?: number; pageSize?: number } = {},
    user?: any,
  ): Promise<{ messages: WhatsAppMessage[]; total: number }> {
    const filter: any = {};
    if (options.waId) filter.waId = options.waId;

    const forbidden = await this.getUserForbiddenWaIds(user);
    if (forbidden && forbidden.length > 0) {
      if (options.waId && forbidden.includes(options.waId)) {
        return { messages: [], total: 0 };
      }
      filter.waId = { ...(filter.waId ? { $eq: filter.waId, $nin: forbidden } : { $nin: forbidden }) };
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    if (options.waId) {
      await this.messageModel
        .updateMany(
          { waId: options.waId, direction: 'inbound', isRead: false },
          { $set: { isRead: true } },
        )
        .exec();
    }

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

  async getUniqueContacts(user?: any): Promise<any[]> {
    const forbidden = await this.getUserForbiddenWaIds(user);
    const matchStage = forbidden && forbidden.length > 0 ? { $match: { waId: { $nin: forbidden } } } : null;

    const pipeline: any[] = [];
    if (matchStage) {
      pipeline.push(matchStage);
    }
    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$waId',
          lastMessageAt: { $first: '$createdAt' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$direction', 'inbound'] },
                    { $eq: ['$isRead', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { waId: '$_id', lastMessageAt: 1, unreadCount: 1, _id: 0 } },
      { $sort: { lastMessageAt: -1 } },
    );

    const agg = await this.messageModel.aggregate(pipeline).exec();

    // Batch resolve Lead/Link details for each contact
    const contactsWithLeads = await Promise.all(
      agg.map(async (c) => {
        const waId = c.waId;
        const link = await this.linkModel
          .findOne({ waId })
          .populate('leadId', 'firstName lastName')
          .lean()
          .exec();

        if (link && link.leadId) {
          const lead = link.leadId as any;
          return {
            ...c,
            leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
            leadId: String(lead._id),
          };
        }

        // Fallback: search Lead collection
        const localNumber = waId.slice(-10);
        if (localNumber.length >= 10) {
          const lead = await this.leadModel
            .findOne({
              $or: [
                { mobileNo: new RegExp(localNumber + '$') },
                { phone: new RegExp(localNumber + '$') },
                { mobileNo: waId },
                { phone: waId },
              ],
            })
            .select('firstName lastName')
            .lean()
            .exec();

          if (lead) {
            return {
              ...c,
              leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
              leadId: String(lead._id),
            };
          }
        }

        return c;
      })
    );

    return contactsWithLeads;
  }

  async handleMediaMessage(
    waId: string,
    mediaId: string,
    type: 'image' | 'document' | 'video' | 'audio',
    caption?: string,
    messageId?: string,
  ): Promise<void> {
    const config = await this.getConfig();
    if (!config) {
      this.logger.error('WhatsApp not configured or inactive; skipping media download');
      return;
    }

    try {
      // 1. Get temporary media URL from Meta Graph API
      const mediaRes = await fetch(`${META_API}/${mediaId}`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      const mediaData = await mediaRes.json().catch(() => ({}));
      if (!mediaRes.ok || !mediaData.url) {
        this.logger.error(`Failed to fetch Meta media url for id ${mediaId}: ${JSON.stringify(mediaData)}`);
        return;
      }

      // 2. Download the binary stream/buffer
      const fileRes = await fetch(mediaData.url, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
      if (!fileRes.ok) {
        this.logger.error(`Failed to download Meta media file from url`);
        return;
      }
      const buffer = Buffer.from(await fileRes.arrayBuffer());

      // 3. Save it to local storage
      const mime = mediaData.mime_type || this.mimeFromType(type);
      const ext = mime.split('/')[1]?.split(';')[0] || this.extFromType(type);
      const filename = `wa_${mediaId}_${Date.now()}.${ext}`;
      
      let uploadResult: any;
      if (type === 'image') {
        uploadResult = await this.storageService.uploadBuffer(buffer, {
          originalName: filename,
          mime,
          ext,
          subfolder: 'uploads',
          skipOptimize: true,
        });
      } else {
        const mockFile: any = {
          buffer,
          originalname: filename,
          mimetype: mime,
        };
        uploadResult = await this.storageService.uploadDocument(mockFile);
      }

      const attachment = {
        type,
        url: uploadResult.url,
        filename: uploadResult.originalName || filename,
      };

      const body = caption || `[${type.toUpperCase()}]`;

      await this.saveIncoming(waId, body, messageId || `meta_${mediaId}`, attachment);
    } catch (e: any) {
      this.logger.error(`Error handling media message ${mediaId}: ${e?.message}`);
    }
  }

  private mimeFromType(type: string): string {
    if (type === 'image') return 'image/jpeg';
    if (type === 'video') return 'video/mp4';
    if (type === 'audio') return 'audio/aac';
    return 'application/octet-stream';
  }

  private extFromType(type: string): string {
    if (type === 'image') return 'jpg';
    if (type === 'video') return 'mp4';
    if (type === 'audio') return 'aac';
    return 'bin';
  }

  async logOutboundMessage(params: {
    phone: string;
    body: string;
    messageId?: string;
    sentBy?: Types.ObjectId;
    module?: string;
    entityId?: Types.ObjectId;
    mediaUrl?: string;
    mediaFilename?: string;
    rawPayload?: any;
    templateName?: string;
  }): Promise<WhatsAppMessageDocument> {
    const phone = params.phone.replace(/\D/g, '');
    const saved = await this.messageModel.create({
      waId: phone,
      direction: 'outbound',
      body: params.body,
      messageId: params.messageId,
      sentBy: params.sentBy,
      module: params.module,
      entityId: params.entityId,
      status: 'sent',
      isRead: true,
      attachment: params.mediaUrl ? {
        type: 'image',
        url: params.mediaUrl,
        filename: params.mediaFilename
      } : undefined,
      meta: {
        ...params.rawPayload,
        provider: 'aisensy',
        template: params.templateName ? { name: params.templateName } : undefined
      },
    });
    this.emitWhatsAppEvent(phone, saved);
    return saved;
  }

  /**
   * Sends an already-uploaded document (e.g. a generated property-share PDF)
   * as its own WhatsApp message — the "Share Property" send path. Mirrors
   * `sendMessage`'s structure/error shape.
   *
   * Meta: a free-form `type: 'document'` session message — same 24h
   * customer-care-window rule WhatsApp applies to free text (enforced today
   * only client-side, via `getWhatsAppCareWindow`, same as the text composer).
   * AiSensy: there is no ad-hoc/session document send on AiSensy's public
   * API (it's campaign/template-scoped, see AiSensyClient's doc comment) —
   * this falls back to `sendTemplateMessage` against a pre-approved
   * `aisensyPropertyShareCampaign` (a document-header template), or fails
   * with guidance if none is configured.
   */
  async sendDocumentMessage(
    to: string,
    mediaUrl: string,
    filename: string,
    caption?: string,
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

    await this.validateSendAccess(phone, userId);

    const absoluteUrl = resolvePublicMediaUrl(mediaUrl) || mediaUrl;

    if (config.provider === 'aisensy') {
      if (!config.aisensyPropertyShareCampaign) {
        return {
          success: false,
          error:
            'AiSensy needs a pre-approved document template — configure an "AiSensy Property Share Campaign" under Settings → Integrations → WhatsApp, or switch the property PDF to a downloadable link instead.',
        };
      }
      return this.sendTemplateMessage({
        to: phone,
        name: config.aisensyPropertyShareCampaign,
        language: 'en',
        bodyPreview: caption || filename,
        userId,
        module,
        entityId,
        mediaUrl: absoluteUrl,
        mediaFilename: filename,
        mediaType: 'document',
      });
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
          type: 'document',
          document: {
            link: absoluteUrl,
            filename,
            ...(caption ? { caption } : {}),
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(`WhatsApp document send failed: ${JSON.stringify(data)}`);
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
        body: caption || '',
        messageId: msgId,
        sentBy: userId ? new Types.ObjectId(userId) : undefined,
        module,
        entityId: entityId ? new Types.ObjectId(entityId) : undefined,
        status: 'sent',
        isRead: true,
        attachment: { type: 'document', url: mediaUrl, filename },
        meta: data,
      });
      this.emitWhatsAppEvent(phone, saved);

      return { success: true, messageId: msgId };
    } catch (e: any) {
      this.logger.error(`WhatsApp document send error: ${e?.message}`);
      return { success: false, error: e?.message || 'Send failed' };
    }
  }

  /**
   * Every attachment ever exchanged with this contact, newest first —
   * powers the chat's "Shared Media" panel. Deliberately a dedicated query
   * rather than a filter over `getConversations`' page, since that call is
   * paginated and older shares would fall off the loaded page.
   */
  async getSharedMedia(waId: string): Promise<{
    images: WhatsAppMessage[];
    documents: WhatsAppMessage[];
    videos: WhatsAppMessage[];
    audio: WhatsAppMessage[];
  }> {
    const messages = await this.messageModel
      .find({ waId, attachment: { $exists: true } })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const images = messages.filter((m) => m.attachment?.type === 'image');
    const documents = messages.filter((m) => m.attachment?.type === 'document');
    const videos = messages.filter((m) => m.attachment?.type === 'video');
    const audio = messages.filter((m) => m.attachment?.type === 'audio');
    return { images, documents, videos, audio };
  }
}
