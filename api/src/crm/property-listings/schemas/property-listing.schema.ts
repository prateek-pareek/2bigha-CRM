import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { applyCrmSoftDeletePlugin } from '../../shared/crm-soft-delete.util';

export type PropertyListingDocument = PropertyListing & Document;

export type PropertyListingType =
  | 'Apartment'
  | 'Villa'
  | 'Independent House'
  | 'Plot'
  | 'Commercial'
  | 'Office'
  | 'Warehouse'
  | 'Other';

export type PropertyListingStatus =
  | 'Available'
  | 'Under Offer'
  | 'Sold'
  | 'Rented'
  | 'Off Market';

export type PropertyListingFor = 'Sale' | 'Rent';

/**
 * A real-estate property listing — standalone module (not tied to
 * Lead/Client/Pipeline). Follows the `WhatsAppTemplate` schema conventions:
 * its own `collection` name, soft delete, and explicit indexes for the
 * filter paths the list page uses (status, type, listedFor, createdAt).
 */
@Schema({ timestamps: true, collection: 'propertylistings' })
export class PropertyListing {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  state?: string;

  @Prop({ trim: true })
  zipCode?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: 'INR' })
  currency?: string;

  @Prop({
    required: true,
    enum: [
      'Apartment',
      'Villa',
      'Independent House',
      'Plot',
      'Commercial',
      'Office',
      'Warehouse',
      'Other',
    ],
    default: 'Apartment',
    index: true,
  })
  propertyType: PropertyListingType;

  @Prop({ enum: ['Sale', 'Rent'], default: 'Sale', index: true })
  listedFor: PropertyListingFor;

  @Prop({ min: 0 })
  bedrooms?: number;

  @Prop({ min: 0 })
  bathrooms?: number;

  @Prop({ min: 0 })
  areaSqft?: number;

  @Prop({
    required: true,
    enum: ['Available', 'Under Offer', 'Sold', 'Rented', 'Off Market'],
    default: 'Available',
    index: true,
  })
  status: PropertyListingStatus;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop()
  listedDate?: Date;

  @Prop({ trim: true })
  contactName?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true })
  contactEmail?: string;

  @Prop({ type: Object, default: {} })
  customFields: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, ref: 'CRMUser' })
  createdBy?: Types.ObjectId;

  @Prop({ default: false, index: true })
  isDeleted?: boolean;

  @Prop()
  deletedAt?: Date;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const PropertyListingSchema =
  SchemaFactory.createForClass(PropertyListing);
applyCrmSoftDeletePlugin(PropertyListingSchema);

PropertyListingSchema.index({ isDeleted: 1, createdAt: -1 });
PropertyListingSchema.index({ status: 1, createdAt: -1 });
PropertyListingSchema.index({ propertyType: 1, createdAt: -1 });
PropertyListingSchema.index({ listedFor: 1, status: 1 });
PropertyListingSchema.index(
  { title: 'text', address: 'text', city: 'text', description: 'text' },
  { name: 'property_listing_search_text', weights: { title: 10, address: 5 } },
);
