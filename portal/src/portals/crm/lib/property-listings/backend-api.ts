import api from "@/lib/crm/api";
import type {
  AreaUnit,
  PropertyListingRecord,
  PropertyListingType,
} from "@/lib/crm/property-listings/types";
import { areaValueToBigha } from "@/lib/crm/property-listings/types";

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
  images?: unknown;
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

const AREA_UNIT_REVERSE: Record<string, AreaUnit> = {
  SQYRD: "Sq. Yard",
  SQFT: "Sq. Ft",
  SQUARE_FEET: "Sq. Ft",
  SQM: "Sq. M",
  ACRE: "Acre",
  HECTARE: "Hectare",
  BIGHA: "Bigha",
  BIGHAS: "Bigha",
  KATHA: "Katha",
  MARLA: "Marla",
  KANAL: "Kanal",
  GUNTA: "Guntha",
  CENT: "Cent",
  NALI: "Nali",
};

function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url) return false;
  if (/^https?:\/\//i.test(url) || url.startsWith("//")) return true;
  return false;
}

function pickImageUrl(img: unknown): string | null {
  if (isUsableImageUrl(img)) return img.trim();
  if (!img || typeof img !== "object") return null;
  const row = img as Record<string, unknown>;
  const variants =
    row.variants && typeof row.variants === "object"
      ? (row.variants as Record<string, unknown>)
      : {};
  const candidates = [
    variants.medium,
    variants.large,
    variants.original,
    variants.thumbnail,
    row.imageUrl,
    row.thumbnailUrl,
    row.url,
  ];
  const found = candidates.find(isUsableImageUrl);
  return found ? found.trim() : null;
}

/** Pull hosted photo URLs from a 2bigha envelope `images` list, `PropertyImage` objects, or raw strings. */
export function extractTwoBighaImageUrls(raw: unknown): string[] {
  const items: unknown[] = [];
  if (Array.isArray(raw)) {
    items.push(...raw);
  } else if (raw && typeof raw === "object") {
    const row = raw as Record<string, unknown>;
    if (Array.isArray(row.images)) items.push(...row.images);
    else if (row.images) items.push(row.images);
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of items) {
    const url = pickImageUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function mapTwoBighaArea(area: unknown, areaUnit: unknown): {
  areaValue?: number;
  areaUnit?: AreaUnit;
  areaSqft?: number;
  areaBigha?: number;
} {
  const value = typeof area === "number" ? area : Number(area);
  if (!Number.isFinite(value) || value <= 0) return {};
  const unitKey = String(areaUnit || "").toUpperCase();
  const unit = AREA_UNIT_REVERSE[unitKey];
  const areaBigha = areaValueToBigha(value, unit) ?? undefined;
  return {
    areaValue: value,
    areaUnit: unit,
    areaSqft: unit === "Sq. Ft" ? value : undefined,
    areaBigha,
  };
}

function contactFromEnvelope(raw: { user?: { firstName?: string; lastName?: string; phone?: string; email?: string } | null }) {
  const u = raw.user;
  if (!u) return {};
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return {
    contactName: name || undefined,
    contactPhone: u.phone || undefined,
    contactEmail: u.email || undefined,
  };
}

/**
 * Maps one live 2bigha farm row onto the portal's `PropertyListingRecord`
 * shape so it can reuse the existing card/table rendering unchanged.
 * Envelope `images` (not `Property.images`) are safe to request — 2bigha's
 * Property.images resolver crashes photo-less rows. `_id` is the 2bigha slug
 * — these rows are read-only, not CRM-owned Mongo documents.
 */
export function mapTwoBighaFarmToRecord(raw: TwoBighaFarmRaw): PropertyListingRecord {
  const p = raw.property || {};
  const now = new Date().toISOString();
  const area = mapTwoBighaArea(p.area, p.areaUnit);
  const images = extractTwoBighaImageUrls(raw.images ?? p.images);
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
    ...area,
    status: p.isActive === false ? "Off Market" : "Available",
    approvalStatus: "Approved",
    verified: p.isVerified,
    images,
    amenities: [],
    twobighaPropertyId: p.id || undefined,
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
    listedDate: p.createdAt || now,
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
  INDUSTRIAL: "Industrial",
  FARMHOUSE: "Farmhouse",
  FARMLAND: "Farmland",
};

/** Maps one live 2bigha standard property row onto PropertyListingRecord shape. */
export function mapTwoBighaPropertyToRecord(raw: any, bucket?: string): PropertyListingRecord {
  const p = raw.property || {};
  const now = new Date().toISOString();
  const area = mapTwoBighaArea(p.area, p.areaUnit);
  const listedAt = p.publishedAt || p.createdAt || now;
  const contact = contactFromEnvelope(raw);
  return {
    _id: String(raw.seo?.slug || p.id || `twobigha-property-${Math.random().toString(36).slice(2)}`),
    listingBucket: "properties",
    title: p.title || p.propertyName || "Untitled property",
    address: p.address || undefined,
    city: p.city || undefined,
    state: p.state || undefined,
    district: p.district || undefined,
    country: p.country || undefined,
    zipCode: p.pinCode || undefined,
    price: typeof p.price === "number" ? p.price : 0,
    currency: "INR",
    propertyType: (p.propertyType && PROPERTY_TYPE_REVERSE[p.propertyType]) || "Other",
    listedFor: "Sale",
    ...area,
    status: p.isActive === false
      ? "Off Market"
      : p.availablilityStatus === "SOLD"
        ? "Sold"
        : p.availablilityStatus === "MANAGED"
          ? "Under Offer"
          : "Available",
    approvalStatus: "Approved",
    verified: p.isVerified,
    viewCount: typeof p.viewCount === "number" ? p.viewCount : undefined,
    likeCount: typeof p.saveCount === "number" ? p.saveCount : undefined,
    images: extractTwoBighaImageUrls(raw.images ?? p.images),
    amenities: Array.isArray(p.amenities) ? p.amenities.filter((a: unknown) => typeof a === "string") : [],
    khasraNumber: p.khasraNumber || undefined,
    twobighaPropertyId: p.id || undefined,
    listedDate: listedAt,
    contactName: contact.contactName || p.ownerName || undefined,
    contactPhone: contact.contactPhone || p.ownerPhone || undefined,
    contactEmail: contact.contactEmail,
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
  };
}
