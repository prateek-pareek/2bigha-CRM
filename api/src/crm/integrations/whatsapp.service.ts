import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WhatsAppMessage,
  WhatsAppMessageDocument,
} from '../schemas/whatsapp-message.schema';
import { Integration } from '../schemas/integration.schema';

const META_API = 'https://graph.facebook.com/v18.0';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectModel(WhatsAppMessage.name, 'crmConnection')
    private messageModel: Model<WhatsAppMessageDocument>,
    @InjectModel(Integration.name, 'crmConnection')
    private integrationModel: Model<any>,
  ) {}

  private async getConfig(): Promise<{
    apiKey: string;
    phoneNumberId: string;
  } | null> {
    const config = await this.integrationModel
      .findOne({ type: 'whatsapp' })
      .lean()
      .exec();
    if (!config?.apiKey || !config?.phoneNumberId || !config?.isActive)
      return null;
    return { apiKey: config.apiKey, phoneNumberId: config.phoneNumberId };
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
      await this.messageModel.create({
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

      return { success: true, messageId: msgId };
    } catch (e: any) {
      this.logger.error(`WhatsApp send error: ${e?.message}`);
      return { success: false, error: e?.message || 'Send failed' };
    }
  }

  async saveIncoming(
    waId: string,
    body: string,
    messageId: string,
  ): Promise<void> {
    await this.messageModel.create({
      waId,
      direction: 'inbound',
      body,
      messageId,
      status: 'delivered',
    });
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
