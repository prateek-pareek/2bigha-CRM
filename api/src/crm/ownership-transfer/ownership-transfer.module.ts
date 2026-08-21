import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CRMModule } from '../crm.module';
import { UsersModule } from '../../users/users.module';
import { Lead, LeadSchema } from '../records/schemas/lead.schema';
import { LegalCase, LegalCaseSchema } from '../records/schemas/legal-case.schema';
import {
  PropertyListing,
  PropertyListingSchema,
} from '../property-listings/schemas/property-listing.schema';
import { OwnershipTransferService } from './ownership-transfer.service';
import { OwnershipTransferController } from './ownership-transfer.controller';

@Module({
  imports: [
    // CRMModule re-exports MongooseModule so RbacGuard's CRMUsersService
    // dependency chain is available without re-registering models (see
    // LegalModule/PropertyListingsModule for the same pattern).
    CRMModule,
    UsersModule,
    MongooseModule.forFeature(
      [
        { name: Lead.name, schema: LeadSchema },
        { name: LegalCase.name, schema: LegalCaseSchema },
        { name: PropertyListing.name, schema: PropertyListingSchema },
      ],
      'crmConnection',
    ),
  ],
  controllers: [OwnershipTransferController],
  providers: [OwnershipTransferService],
  exports: [OwnershipTransferService],
})
export class OwnershipTransferModule {}
