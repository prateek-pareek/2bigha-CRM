import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CRMUsersModule } from '../crm-users/crm-users.module';
import { LegalCase, LegalCaseSchema } from '../records/schemas/legal-case.schema';
import { Lead, LeadSchema } from '../records/schemas/lead.schema';
import { Contact, ContactSchema } from '../records/schemas/contact.schema';
import { LegalCaseService } from './legal-case.service';
import { LegalCaseController } from './legal-case.controller';

@Module({
  imports: [
    // Needed for RbacGuard's CRMUsersService dependency.
    CRMUsersModule,
    MongooseModule.forFeature(
      [
        { name: LegalCase.name, schema: LegalCaseSchema },
        // Same LeadSchema/ContactSchema instances already registered by
        // CRMModule — mongoose only rejects re-registration when the schema
        // object differs, so this is safe (same pattern as SalesAgentModule).
        { name: Lead.name, schema: LeadSchema },
        { name: Contact.name, schema: ContactSchema },
      ],
      'crmConnection',
    ),
  ],
  controllers: [LegalCaseController],
  providers: [LegalCaseService],
  exports: [LegalCaseService],
})
export class LegalModule {}
