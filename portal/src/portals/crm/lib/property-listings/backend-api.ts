import api from "@/lib/crm/api";

/**
 * Calls this repo's own NestJS backend (`/crm/property-listings`) — the
 * route that actually syncs to 2bigha via TwoBighaPropertyService — as
 * opposed to `third-party-api.ts` in this same directory, which talks to a
 * separate mock/REST facade that has no connection to the real 2bigha
 * GraphQL integration. Used by the Lead-linked "Add Property"/"Add Farm"
 * flow (AddPropertyModal, LeadPropertiesPanel); the standalone
 * /crm/property-listings list/detail pages still read the older mock and
 * are a separate follow-up to migrate.
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
