import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Integration, IntegrationDocument } from '../schemas/integration.schema';

@Injectable()
export class SlackIntegrationService {
  private readonly logger = new Logger(SlackIntegrationService.name);

  constructor(
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<IntegrationDocument>,
  ) {}

  private validateWebhookUrl(raw: unknown): string {
    const value = String(raw || '').trim();
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('Enter a valid Slack webhook URL');
    }
    const allowedHosts = new Set(['hooks.slack.com', 'hooks.slack-gov.com']);
    if (
      url.protocol !== 'https:' ||
      !allowedHosts.has(url.hostname) ||
      !url.pathname.startsWith('/services/')
    ) {
      throw new BadRequestException(
        'Webhook must be an HTTPS Slack Incoming Webhook URL',
      );
    }
    return url.toString();
  }

  async notifySlack(
    module: string,
    message: { title: string; text: string },
  ): Promise<void> {
    const integrations = await this.integrationModel
      .find({
        name: 'Slack',
        module: { $in: [module, 'all'] },
        isActive: true,
      })
      .exec();

    for (const integration of integrations) {
      const webhookUrl = integration.config?.webhookUrl;
      if (!webhookUrl) continue;
      try {
        const response = await fetch(this.validateWebhookUrl(webhookUrl), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `*${message.title}*\n${message.text}`,
            blocks: [
              {
                type: 'header',
                text: { type: 'plain_text', text: message.title.slice(0, 150) },
              },
              {
                type: 'section',
                text: { type: 'mrkdwn', text: message.text.slice(0, 2900) },
              },
            ],
          }),
        });
        if (!response.ok) {
          throw new Error(`Slack returned HTTP ${response.status}`);
        }
      } catch (error) {
        this.logger.error(
          `Failed to send Slack notification: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async saveIntegration(data: {
    module?: string;
    config?: { webhookUrl?: string };
  }): Promise<Integration> {
    const webhookUrl = this.validateWebhookUrl(data.config?.webhookUrl);
    return new this.integrationModel({
      name: 'Slack',
      providerId: 'slack',
      type: 'webhook',
      authType: 'webhook',
      status: 'connected',
      connectedAt: new Date(),
      module: String(data.module || 'all'),
      config: { webhookUrl },
      isActive: true,
    }).save();
  }

  async findAll(): Promise<Array<Record<string, unknown>>> {
    const rows = await this.integrationModel
      .find({ name: 'Slack' })
      .select('_id name module isActive status createdAt')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return rows.map((row) => ({
      ...row,
      config: { webhookUrl: 'configured' },
    }));
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const result = await this.integrationModel.deleteOne({
      _id: id,
      name: 'Slack',
    });
    return { success: result.deletedCount === 1 };
  }

  async test(webhookUrl: string): Promise<{ success: boolean }> {
    const url = this.validateWebhookUrl(webhookUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Mathionix CRM Slack connection is working.',
      }),
    });
    if (!response.ok) {
      throw new BadRequestException(
        `Slack test failed with HTTP ${response.status}`,
      );
    }
    return { success: true };
  }
}
