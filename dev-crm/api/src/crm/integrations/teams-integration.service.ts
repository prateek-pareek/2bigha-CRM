import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Integration, IntegrationDocument } from '../schemas/integration.schema';

@Injectable()
export class TeamsIntegrationService {
  constructor(
    @InjectModel(Integration.name, 'crmConnection')
    private integrationModel: Model<IntegrationDocument>,
  ) {}

  async notifyTeams(
    module: string,
    message: { title: string; text: string },
  ): Promise<void> {
    const integrations = await this.integrationModel
      .find({
        name: 'Microsoft Teams',
        module: { $in: [module, 'all'] },
        isActive: true,
      })
      .exec();

    for (const integration of integrations) {
      const webhookUrl = integration.config?.webhookUrl;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              '@type': 'MessageCard',
              '@context': 'http://schema.org/extensions',
              themeColor: '0076D7',
              summary: message.title,
              sections: [
                {
                  activityTitle: message.title,
                  activitySubtitle: message.text,
                  markdown: true,
                },
              ],
            }),
          });
        } catch (error) {
          console.error('Failed to send Teams notification:', error);
        }
      }
    }
  }

  async saveIntegration(data: any): Promise<Integration> {
    return new this.integrationModel({
      ...data,
      name: 'Microsoft Teams',
      type: 'webhook',
    }).save();
  }

  async findAll(): Promise<Integration[]> {
    return this.integrationModel.find({ name: 'Microsoft Teams' }).exec();
  }
}
