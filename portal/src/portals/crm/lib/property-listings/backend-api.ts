import api from "@/lib/crm/api";
import type { PropertyListingRecord, PropertyListingType } from "@/lib/crm/property-listings/types";

/**
 * Calls this repo's own NestJS backend (`/crm/property-listings`) — the
 * route that actually syncs to 2bigha via TwoBighaPropertyService — as
 * opposed to `third-party-api.ts` in this same directory, which talks to a
 * separate mock/REST facade that has no connection to the real 2bigha
 * GraphQL integration. Used by the Lead-linked "Add Property"/"Add Farm"
 * flow (AddPropertyModal, LeadPropertiesPanel) and by the standalone
 * /crm/property-listings list page's FARMS bucket (fetchTwoBighaFarms) —
 * the BUY/SELL/PM buckets and the listing detail page still read the older
 * mock and are a separate follow-up to migrate.
 */

export type TwoBighaSyncStatus = "not_synced" | "synced" | "mock" | "failed" | "unsupported";

export interface BackendPropertyListing {
  _id: string;
  title: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  price: number;
  currency?: string;
  propertyType?: string;
  listedFor?: string;
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  status?: string;
  approvalStatus?: string;
  description?: string;
  images?: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  leadId?: string;
  twobighaPropertyId?: string;
  twobighaSyncStatus?: TwoBighaSyncStatus;
  twobighaSyncError?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateBackendPropertyListingInput {
  title: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  placeId?: string;
  price: number;
  currency?: string;
  propertyType?: string;
  listedFor?: "Sale" | "Rent";
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  areaUnit?: string;
  khasraNumber?: string;
  murabbaNumber?: string;
  khewatNumber?: string;
  pricePerUnit?: string;
  waterLevel?: number;
  landMark?: string[];
  landMarkName?: Record<string, unknown>;
  category?: string;
  highwayConn?: boolean;
  landZoning?: string;
  ownersCount?: number;
  ownershipYes?: boolean;
  soilType?: string;
  roadAccess?: boolean;
  roadAccessDistance?: number;
  roadAccessWidth?: number;
  roadAccessDistanceUnit?: string;
  status?: string;
  approvalStatus?: string;
  description?: string;
  images?: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  listerType?: string;
  whatsappNumber?: string;
  mapBoundaries?: unknown;
  mapCoordinates?: unknown;
  mapLocation?: unknown;
  leadId?: string;
}

export async function fetchTwoBighaImageUploadUrls(
  count: number,
): Promise<Array<{ uploadUrl: string; blobPath: string }>> {
  const { data } = await api.get<Array<{ uploadUrl: string; blobPath: string }>>(
    "/crm/property-listings/twobigha/image-upload-urls",
    { params: { count } },
  );
  return data || [];
}

/** Uploads an image file to Azure Blob Storage via backend proxy (avoiding browser CORS). */
export async function uploadPropertyImageToAzure(
  file: File,
): Promise<{ blobPath: string; url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<{ blobPath: string; url: string }>(
    "/crm/property-listings/twobigha/upload-image-proxy",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
}

export async function createBackendPropertyListing(
  input: CreateBackendPropertyListingInput,
): Promise<BackendPropertyListing> {
  const { data } = await api.post<BackendPropertyListing>("/crm/property-listings", input);
  return data;
}

export async function fetchBackendPropertyListingsByLead(
  leadId: string,
): Promise<BackendPropertyListing[]> {
  const { data } = await api.get<{ data: BackendPropertyListing[] }>("/crm/property-listings", {
    params: { leadId, pageSize: 200 },
  });
  return data?.data || [];
}

/** Retry a listing's last (failed/mock) sync to 2bigha — see PropertyListingsService.retrySync. */
export async function retryBackendPropertyListingSync(
  id: string,
): Promise<BackendPropertyListing> {
  const { data } = await api.post<BackendPropertyListing>(`/crm/property-listings/${id}/sync-2bigha`);
  return data;
}

/** Raw shape of one `getFarms` row from 2bigha, per TwoBighaPropertyService's FARM_DETAIL_FIELDS. */
export interface TwoBighaFarmRaw {
  property?: {
    id?: string;
    propertyName?: string;
    title?: string;
    description?: string;
    propertyType?: string;
    status?: string;
    price?: number;
    area?: number;
    areaUnit?: string;
    address?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    source?: string;
    isVerified?: boolean;
    isActive?: boolean;
    images?: string[];
    createdAt?: string;
    updatedAt?: string;
  } | null;
  seo?: { slug?: string } | null;
}

/** Live read-through to 2bigha's getFarms — real farm marketplace data, replacing the FARMS bucket's old static mock. */
export async function fetchTwoBighaFarms(params: {
  page?: number;
  limit?: number;
  searchTerm?: string;
}): Promise<{ data: TwoBighaFarmRaw[]; total: number }> {
  const { data } = await api.get<{
    data?: TwoBighaFarmRaw[];
    meta?: { total?: number };
  } | null>("/crm/property-listings/twobigha/farms", {
    params: { page: params.page, limit: params.limit, searchTerm: params.searchTerm },
  });
  const rows = data?.data || [];
  return { data: rows, total: data?.meta?.total ?? rows.length };
}

/** 2bigha's larger PropertyType enum, reversed onto the portal's farm-ish PropertyListingType values (see AddPropertyModal's forward mapping). */
const FARM_PROPERTY_TYPE_REVERSE: Record<string, PropertyListingType> = {
  AGRICULTURAL: "Agricultural",
  FARMLAND: "Farmland",
  FARMHOUSE: "Farmhouse",
};

/**
 * Maps one live 2bigha farm row onto the portal's `PropertyListingRecord`
 * shape so it can reuse the existing card/table rendering unchanged.
 * `images` is deliberately left empty — TwoBighaPropertyService's
 * FARM_DETAIL_FIELDS doesn't request `images` (2bigha's own resolver
 * crashes the whole query for a photo-less property; see that file's
 * comment on PROPERTY_DETAIL_FIELDS). `_id` is 2bigha's own id — these rows
 * are read-only, not CRM-owned Mongo documents, so edit/delete are disabled
 * for them at the call site (see property-listings/page.tsx).
 */
export function mapTwoBighaFarmToRecord(raw: TwoBighaFarmRaw): PropertyListingRecord {
  const p = raw.property || {};
  const now = new Date().toISOString();
  return {
    _id: String(raw.seo?.slug || p.id || `twobigha-farm-${Math.random().toString(36).slice(2)}`),
    listingBucket: "farm",
    title: p.title || p.propertyName || "Untitled farm",
    address: p.address || undefined,
    city: p.city || undefined,
    state: p.state || undefined,
    district: p.district || undefined,
    country: p.country || undefined,
    price: typeof p.price === "number" ? p.price : 0,
    currency: "INR",
    propertyType: (p.propertyType && FARM_PROPERTY_TYPE_REVERSE[p.propertyType]) || "Farm",
    listedFor: "Sale",
    areaSqft: p.areaUnit === "SQFT" ? p.area : undefined,
    status: p.isActive === false ? "Managed" : "Available",
    approvalStatus: "Approved",
    verified: p.isVerified,
    images: Array.isArray(p.images) ? p.images : [],
    amenities: [],
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
  };
}

const PROPERTY_TYPE_REVERSE: Record<string, PropertyListingType> = {
  APARTMENT: "Apartment",
  VILLA: "Villa",
  RESIDENTIAL: "Independent House",
  PLOT: "Plot",
  COMMERCIAL: "Commercial",
  OFFICE: "Office",
  WAREHOUSE: "Warehouse",
  FARM: "Farm",
  AGRICULTURAL: "Agricultural",
};

/** Maps one live 2bigha standard property row onto PropertyListingRecord shape. */
export function mapTwoBighaPropertyToRecord(raw: any, bucket?: string): PropertyListingRecord {
  const p = raw.property || {};
  const now = new Date().toISOString();
  const rawImages: string[] = Array.isArray(p.images) && p.images.length > 0
    ? p.images
    : Array.isArray(raw.images)
      ? raw.images.map((img: any) => (typeof img === "string" ? img : img.variants?.thumbnail || img.thumbnailUrl || img.url)).filter(Boolean)
      : [];

  return {
    _id: String(raw.seo?.slug || p.id || `twobigha-property-${Math.random().toString(36).slice(2)}`),
    listingBucket: "properties",
    title: p.title || p.propertyName || "Untitled property",
    address: p.address || undefined,
    city: p.city || undefined,
    state: p.state || undefined,
    district: p.district || undefined,
    country: p.country || undefined,
    zipCode: p.pinCode || p.zipCode || undefined,
    price: typeof p.price === "number" ? p.price : 0,
    currency: "INR",
    propertyType: (p.propertyType && PROPERTY_TYPE_REVERSE[p.propertyType]) || "Other",
    listedFor: "Sale",
    areaSqft: p.areaUnit === "SQFT" ? p.area : undefined,
    areaValue: typeof p.area === "number" ? p.area : undefined,
    areaUnit: p.areaUnit,
    status: p.availablilityStatus === "SOLD"
      ? "Sold"
      : p.availablilityStatus === "MANAGED"
        ? "Managed"
        : "Available",
    approvalStatus: p.approvalStatus || "Approved",
    verified: p.isVerified,
    description: p.description || undefined,
    images: rawImages,
    amenities: p.amenities || [],
    khasraNumber: p.khasraNumber || undefined,
    murabbaNumber: p.murabbaNumber || undefined,
    khewatNumber: p.khewatNumber || undefined,
    pricePerUnit: p.pricePerUnit ? String(p.pricePerUnit) : undefined,
    waterLevel: p.waterLevel != null ? Number(p.waterLevel) : undefined,
    landMark: Array.isArray(p.landMark) ? p.landMark : undefined,
    landMarkName: p.landMarkName || undefined,
    category: p.category || undefined,
    highwayConn: p.highwayConn != null ? Boolean(p.highwayConn) : undefined,
    landZoning: p.landZoning || undefined,
    ownersCount: p.ownersCount != null ? Number(p.ownersCount) : undefined,
    ownershipYes: p.ownershipYes != null ? Boolean(p.ownershipYes) : undefined,
    soilType: p.soilType || undefined,
    roadAccess: p.roadAccess != null ? Boolean(p.roadAccess) : undefined,
    roadAccessDistance: p.roadAccessDistance != null ? Number(p.roadAccessDistance) : undefined,
    roadAccessWidth: p.roadAccessWidth != null ? Number(p.roadAccessWidth) : undefined,
    roadAccessDistanceUnit: p.roadAccessDistanceUnit || undefined,
    listerType: p.listerType || undefined,
    contactName: p.contactName || undefined,
    contactPhone: p.contactPhone || undefined,
    whatsappNumber: p.whatsappNumber || undefined,
    mapBoundaries: p.mapBoundaries || undefined,
    mapCoordinates: p.mapCoordinates || undefined,
    mapLocation: p.mapLocation || undefined,
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
  };
}
