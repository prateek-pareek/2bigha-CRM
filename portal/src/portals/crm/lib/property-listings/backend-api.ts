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
  state?: string;
  zipCode?: string;
  country?: string;
  price: number;
  currency?: string;
  propertyType?: string;
  listedFor?: "Sale" | "Rent";
  bedrooms?: number;
  bathrooms?: number;
  areaSqft?: number;
  status?: string;
  description?: string;
  images?: string[];
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  leadId?: string;
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
    status: p.isActive === false ? "Off Market" : "Available",
    approvalStatus: "Approved",
    verified: p.isVerified,
    images: Array.isArray(p.images) ? p.images : [],
    amenities: [],
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
  };
}
