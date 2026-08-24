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
  | 'Farm'
  | 'Other';

export type PropertyListingStatus =
  | 'Available'
  | 'Under Offer'
  | 'Sold'
  | 'Rented'
  | 'Off Market';

export type PropertyListingFor = 'Sale' | 'Rent';

export type PropertyListingApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

/**
 * Outcome of the most recent sync attempt to 2bigha — see TwoBighaPropertyService.
 * 'unsupported' is farm-specific: 2bigha has no general farm-update mutation
 * (only updateFarmSeo, for SEO fields only), so an edit to an already-synced
 * Farm listing can't be pushed and is reported this way instead of 'failed'.
 */
export type TwoBighaSyncStatus =
  | 'not_synced'
  | 'synced'
  | 'mock'
  | 'failed'
  | 'unsupported';

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
      'Farm',
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

  /** Approval gate — only 'Approved' listings show in the default Listing view. UI-only for now; enforcement in other modules (public site, lead-linked pickers) comes in a later pass. */
  @Prop({
    required: true,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true,
  })
  approvalStatus: PropertyListingApprovalStatus;

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

  @Prop({ type: Types.ObjectId, ref: 'Lead', index: true })
  leadId?: Types.ObjectId;

  /** 2bigha-side property id once synced (see TwoBighaPropertyService). Unset until the first create sync (real or mock) succeeds. */
  @Prop({ trim: true, index: true })
  twobighaPropertyId?: string;

  @Prop({
    enum: ['not_synced', 'synced', 'mock', 'failed', 'unsupported'],
    default: 'not_synced',
    index: true,
  })
  twobighaSyncStatus?: TwoBighaSyncStatus;

  /** Error message from the last failed sync attempt — cleared on the next successful (or mock) sync. */
  @Prop({ trim: true })
  twobighaSyncError?: string;

  @Prop()
  twobighaSyncedAt?: Date;

  /** Raw property/farm detail snapshot last returned by 2bigha (create/update response, or a getPropertyBySlug read) — for display, not a schema-enforced shape. */
  @Prop({ type: Object })
  twobighaDetail?: Record<string, unknown>;

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
PropertyListingSchema.index({ approvalStatus: 1, createdAt: -1 });
PropertyListingSchema.index({ propertyType: 1, createdAt: -1 });
PropertyListingSchema.index({ listedFor: 1, status: 1 });
PropertyListingSchema.index(
  { title: 'text', address: 'text', city: 'text', description: 'text' },
  { name: 'property_listing_search_text', weights: { title: 10, address: 5 } },
);
