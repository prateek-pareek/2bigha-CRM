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
import { MetaLeadAdsService } from './meta-lead-ads.service';
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
    private readonly metaLeadAdsService: MetaLeadAdsService,
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

  /** Fields a caller may set on the `type: 'whatsapp'` Integration doc — an
   * explicit allowlist so a loose/careless request body can't clobber
   * internal bookkeeping fields like `templates`/`templatesSyncedAt`. */
  private static readonly WHATSAPP_CONFIG_FIELDS = [
    'provider',
    'apiKey',
    'phoneNumberId',
    'businessAccountId',
    'sourceLabel',
    'appSecret',
    'aisensyProjectId',
    'aisensyProjectApiPassword',
    'isActive',
  ] as const;

  @Post('whatsapp')
  @Permissions('settings:write')
  async saveWhatsAppConfig(@Body() data: any) {
    const update: Record<string, any> = { type: 'whatsapp' };
    for (const field of IntegrationsController.WHATSAPP_CONFIG_FIELDS) {
      if (data?.[field] !== undefined) update[field] = data[field];
    }
    return this.integrationModel
      .findOneAndUpdate({ type: 'whatsapp' }, update, { upsert: true, new: true })
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

  @Get('meta-leadgen')
  @Permissions('settings:write')
  async getMetaLeadAdsConfig() {
    return this.integrationModel.findOne({ type: 'meta-leadgen' }).exec();
  }

  /** Same explicit-allowlist rationale as WHATSAPP_CONFIG_FIELDS above — keeps
   * a loose request body from clobbering the cached `forms`/`formsSyncedAt`. */
  private static readonly META_LEADGEN_CONFIG_FIELDS = [
    'pageId',
    'pageAccessToken',
    'formIds',
    'appSecret',
    'sourceLabel',
    'isActive',
  ] as const;

  @Post('meta-leadgen')
  @Permissions('settings:write')
  async saveMetaLeadAdsConfig(@Body() data: any) {
    const update: Record<string, any> = { type: 'meta-leadgen' };
    for (const field of IntegrationsController.META_LEADGEN_CONFIG_FIELDS) {
      if (data?.[field] !== undefined) update[field] = data[field];
    }
    return this.integrationModel
      .findOneAndUpdate({ type: 'meta-leadgen' }, update, { upsert: true, new: true })
      .exec();
  }

  @Post('meta-leadgen/test')
  @Permissions('settings:write')
  async testMetaLeadAds() {
    return this.metaLeadAdsService.testConnection();
  }

  @Get('meta-leadgen/forms')
  @Permissions('settings:write')
  async listMetaLeadAdsForms() {
    return this.metaLeadAdsService.listForms();
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
