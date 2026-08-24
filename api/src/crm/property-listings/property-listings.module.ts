import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PropertyListingsController } from './property-listings.controller';
import { PropertyShareController } from './property-share.controller';
import { PropertyListingsService } from './property-listings.service';
import { TwoBighaPropertyService } from './twobigha-property.service';
import { PropertyShareService } from './property-share-pdf.service';
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
    // It also exports WhatsAppService, which PropertyShareController needs
    // to send the generated PDF once it's built.
    CRMModule,
    MongooseModule.forFeature(
      [{ name: PropertyListing.name, schema: PropertyListingSchema }],
      'crmConnection',
    ),
  ],
  controllers: [PropertyListingsController, PropertyShareController],
  providers: [PropertyListingsService, TwoBighaPropertyService, PropertyShareService],
  exports: [PropertyListingsService],
})
export class PropertyListingsModule {}
