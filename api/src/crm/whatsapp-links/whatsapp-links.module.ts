import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsAppLinksController } from './whatsapp-links.controller';
import { WhatsAppLinksService } from './whatsapp-links.service';
import {
  WhatsAppLeadLink,
  WhatsAppLeadLinkSchema,
} from './schemas/whatsapp-lead-link.schema';
import { CRMModule } from '../crm.module';

@Module({
  imports: [
    // CRMModule re-exports MongooseModule so the already-registered `Lead`
    // model (on 'crmConnection') can be injected here without this module
    // re-registering it itself, which would throw OverwriteModelError.
    CRMModule,
    MongooseModule.forFeature(
      [{ name: WhatsAppLeadLink.name, schema: WhatsAppLeadLinkSchema }],
      'crmConnection',
    ),
  ],
  controllers: [WhatsAppLinksController],
  providers: [WhatsAppLinksService],
  exports: [WhatsAppLinksService],
})
export class WhatsAppLinksModule {}
