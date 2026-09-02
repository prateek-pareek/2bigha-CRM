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
  // Was missing despite being a valid schema enum value (and the value the
  // service/stats/leaderboard aggregations already branch on) — omitting it
  // silently rejected every "Add Farm" create call. Farm-typed listings sync
  // to 2bigha's separate Farm API (createFarmByAdmin) instead of Property.
  'Farm',
  'Agricultural',
  'Residential',
  'Industrial',
  'Farmhouse',
  'Farmland',
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
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  khasraNumber?: string;

  @IsOptional()
  @IsString()
  murabbaNumber?: string;

  @IsOptional()
  @IsString()
  khewatNumber?: string;

  @IsOptional()
  @IsString()
  areaUnit?: string;

  /** Native area for PM createManagedPropertyInput.Area (stripped by whitelist if omitted). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  areaValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  areaBigha?: number;

  @IsOptional()
  @IsString()
  pricePerUnit?: string;

  @IsOptional()
  roadAccess?: boolean;

  @IsOptional()
  @IsNumber()
  roadAccessDistance?: number;

  @IsOptional()
  @IsNumber()
  roadAccessWidth?: number;

  @IsOptional()
  @IsString()
  roadAccessDistanceUnit?: string;

  @IsOptional()
  highwayConn?: boolean;

  @IsOptional()
  @IsNumber()
  waterLevel?: number;

  @IsOptional()
  @IsString()
  soilType?: string;

  @IsOptional()
  ownershipYes?: boolean;

  @IsOptional()
  @IsNumber()
  ownersCount?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  landZoning?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  landMark?: string[];

  @IsOptional()
  landMarkName?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  listerType?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  mapBoundaries?: Record<string, unknown> | unknown[];

  @IsOptional()
  mapCoordinates?: Record<string, unknown> | unknown[];

  @IsOptional()
  mapLocation?: Record<string, unknown>;

  @IsOptional()
  customFields?: Record<string, unknown>;

  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsIn(['properties', 'farm', 'pm'])
  listingBucket?: 'properties' | 'farm' | 'pm';

  @IsOptional()
  @IsString()
  userPropertyId?: string;

  @IsOptional()
  @IsString()
  pmStage?: string;

  @IsOptional()
  @IsString()
  pmPlan?: string;

  @IsOptional()
  @IsString()
  village?: string;

  @IsOptional()
  @IsString()
  tehsil?: string;

  @IsOptional()
  @IsString()
  googleMapsLink?: string;

  @IsOptional()
  @IsString()
  rmAssigneeId?: string;

  @IsOptional()
  @IsString()
  rmAssigneeName?: string;

  @IsOptional()
  @IsString()
  legalAssigneeId?: string;

  @IsOptional()
  @IsString()
  legalAssigneeName?: string;

  @IsOptional()
  @IsString()
  fieldAssigneeId?: string;

  @IsOptional()
  @IsString()
  fieldAssigneeName?: string;
}
