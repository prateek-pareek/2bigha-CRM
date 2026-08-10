import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TeamsIntegrationService } from './teams-integration.service';
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RbacGuard } from '../crm-users/rbac.guard';
import { Permissions } from '../crm-users/permissions.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TeamsBotService } from '../../teams-bot/teams-bot.service';
import { IntegrationCatalogService } from '../integration-catalog/integration-catalog.service';
import { SlackIntegrationService } from './slack-integration.service';

@Controller('crm/integrations')
@UseGuards(JwtAuthGuard, RbacGuard)
export class IntegrationsController {
  constructor(
    private readonly teamsService: TeamsIntegrationService,
    private readonly whatsappService: WhatsAppService,
    private readonly teamsBotService: TeamsBotService,
    private readonly catalogService: IntegrationCatalogService,
    private readonly slackService: SlackIntegrationService,
    @InjectModel('Integration', 'crmConnection')
    private readonly integrationModel: Model<any>,
  ) {}

  /** Marketplace catalog with live connection status for each app. */
  @Get('catalog')
  @Permissions('settings:write')
  listCatalog() {
    return this.catalogService.listCatalog();
  }

  @Get('catalog/:providerId')
  @Permissions('settings:write')
  getCatalogItem(@Param('providerId') providerId: string) {
    return this.catalogService.getCatalogItem(providerId);
  }

  @Delete('catalog/:providerId')
  @Permissions('settings:write')
  disconnectCatalogItem(@Param('providerId') providerId: string) {
    return this.catalogService.disconnect(providerId);
  }

  /** Same Microsoft Graph app + TEAMS_SENDER_ID power CRM workflow Teams actions and PM task DMs. */
  @Get('teams-dm-status')
  @Permissions('dashboard:read')
  teamsDmStatus() {
    return this.teamsBotService.getConfigurationStatus();
  }

  @Get('whatsapp')
  @Permissions('settings:write')
  async getWhatsAppConfig() {
    return this.integrationModel.findOne({ type: 'whatsapp' }).exec();
  }

  @Post('whatsapp')
  @Permissions('settings:write')
  async saveWhatsAppConfig(@Body() data: any) {
    return this.integrationModel
      .findOneAndUpdate(
        { type: 'whatsapp' },
        { ...data, type: 'whatsapp' },
        { upsert: true, new: true },
      )
      .exec();
  }

  @Post('whatsapp/test')
  @Permissions('settings:write')
  async testWhatsApp(@Body('phone') phone: string) {
    const result = await this.whatsappService.sendMessage(
      phone,
      'Hello from 2Bigha CRM! This is a test message.',
    );
    if (result.success)
      return { success: true, message: `Test message sent to ${phone}` };
    return { success: false, message: result.error || 'Send failed' };
  }

  @Get('teams')
  @Permissions('settings:write')
  findAllTeams() {
    return this.teamsService.findAll();
  }

  @Post('teams')
  @Permissions('settings:write')
  saveTeams(@Body() data: any) {
    return this.teamsService.saveIntegration(data);
  }

  @Get('slack')
  @Permissions('settings:write')
  findAllSlack() {
    return this.slackService.findAll();
  }

  @Post('slack')
  @Permissions('settings:write')
  saveSlack(@Body() data: any) {
    return this.slackService.saveIntegration(data);
  }

  @Post('slack/test')
  @Permissions('settings:write')
  testSlack(@Body('webhookUrl') webhookUrl: string) {
    return this.slackService.test(webhookUrl);
  }

  @Delete('slack/:id')
  @Permissions('settings:write')
  removeSlack(@Param('id') id: string) {
    return this.slackService.remove(id);
  }
}
