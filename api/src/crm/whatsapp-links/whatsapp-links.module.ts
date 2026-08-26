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
    // and `WhatsAppLeadLink` models (on 'crmConnection') can be injected
    // here without this module re-registering them, which would throw
    // OverwriteModelError.
    CRMModule,
  ],
  controllers: [WhatsAppLinksController],
  providers: [WhatsAppLinksService],
  exports: [WhatsAppLinksService],
})
export class WhatsAppLinksModule {}
