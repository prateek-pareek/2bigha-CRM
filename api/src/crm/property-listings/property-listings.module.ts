import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertyListingsController } from './property-listings.controller';
import { PropertyListingsService } from './property-listings.service';
import {
  PropertyListing,
  PropertyListingSchema,
} from './schemas/property-listing.schema';
import { CRMModule } from '../crm.module';

@Module({
  imports: [
    // CRMModule re-exports MongooseModule so RbacGuard's CRMUsersService
    // dependency chain and any shared crmConnection models are available
    // without this module re-registering them (would throw OverwriteModelError).
    CRMModule,
    MongooseModule.forFeature(
      [{ name: PropertyListing.name, schema: PropertyListingSchema }],
      'crmConnection',
    ),
  ],
  controllers: [PropertyListingsController],
  providers: [PropertyListingsService],
  exports: [PropertyListingsService],
})
export class PropertyListingsModule {}
