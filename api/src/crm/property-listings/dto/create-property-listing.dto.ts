import {
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const PROPERTY_TYPES = [
  'Apartment',
  'Villa',
  'Independent House',
  'Plot',
  'Commercial',
  'Office',
  'Warehouse',
  'Other',
] as const;

const LISTING_STATUSES = [
  'Available',
  'Under Offer',
  'Sold',
  'Rented',
  'Off Market',
] as const;

const APPROVAL_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;

export class CreatePropertyListingDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(PROPERTY_TYPES)
  propertyType?: (typeof PROPERTY_TYPES)[number];

  @IsOptional()
  @IsIn(['Sale', 'Rent'])
  listedFor?: 'Sale' | 'Rent';

  @IsOptional()
  @IsNumber()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  areaSqft?: number;

  @IsOptional()
  @IsIn(LISTING_STATUSES)
  status?: (typeof LISTING_STATUSES)[number];

  @IsOptional()
  @IsIn(APPROVAL_STATUSES)
  approvalStatus?: (typeof APPROVAL_STATUSES)[number];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsString()
  listedDate?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @IsMongoId()
  leadId?: string;
}
