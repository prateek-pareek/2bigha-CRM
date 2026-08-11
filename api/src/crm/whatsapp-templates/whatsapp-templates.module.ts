import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppTemplatesController } from './whatsapp-templates.controller';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import {
  WhatsAppTemplate,
  WhatsAppTemplateSchema,
} from './schemas/whatsapp-template.schema';
import { CRMModule } from '../crm.module';

@Module({
  imports: [
    // CRMModule re-exports MongooseModule so the already-registered
    // `Integration` model (on 'crmConnection') can be injected here without
    // this module re-registering it itself, which would throw
    // OverwriteModelError (mongoose forbids compiling the same model name
    // twice on one connection).
    CRMModule,
    MongooseModule.forFeature(
      [{ name: WhatsAppTemplate.name, schema: WhatsAppTemplateSchema }],
      'crmConnection',
    ),
  ],
  controllers: [WhatsAppTemplatesController],
  providers: [WhatsAppTemplatesService],
  exports: [WhatsAppTemplatesService],
})
export class WhatsAppTemplatesModule {}
