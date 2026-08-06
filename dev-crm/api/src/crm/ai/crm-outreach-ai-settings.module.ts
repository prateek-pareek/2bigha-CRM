import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CrmOutreachAiSettings,
  CrmOutreachAiSettingsSchema,
} from '../schemas/crm-outreach-ai-settings.schema';
import { CrmOutreachAiSettingsService } from './crm-outreach-ai-settings.service';

/** Shared CRM outreach AI settings (model + prompts) for CRM and Social modules. */
@Module({
  imports: [
    MongooseModule.forFeature(
      [{ name: CrmOutreachAiSettings.name, schema: CrmOutreachAiSettingsSchema }],
      'crmConnection',
    ),
  ],
  providers: [CrmOutreachAiSettingsService],
  exports: [CrmOutreachAiSettingsService],
})
export class CrmOutreachAiSettingsModule {}
