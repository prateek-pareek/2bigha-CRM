import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppCampaignsController } from './whatsapp-campaigns.controller';
import { WhatsAppCampaignsService } from './whatsapp-campaigns.service';
import {
  WhatsAppCampaign,
  WhatsAppCampaignSchema,
} from './schemas/whatsapp-campaign.schema';
import { CRMModule } from '../crm.module';
import { WhatsAppTemplatesModule } from '../whatsapp-templates/whatsapp-templates.module';

@Module({
  imports: [
    // CRMModule re-exports MongooseModule so the already-registered `Lead`
    // and `Integration` models (on 'crmConnection') can be injected here
    // without this module re-registering them itself, which would throw
    // OverwriteModelError.
    CRMModule,
    WhatsAppTemplatesModule,
    MongooseModule.forFeature(
      [{ name: WhatsAppCampaign.name, schema: WhatsAppCampaignSchema }],
      'crmConnection',
    ),
  ],
  controllers: [WhatsAppCampaignsController],
  providers: [WhatsAppCampaignsService],
  exports: [WhatsAppCampaignsService],
})
export class WhatsAppCampaignsModule {}
