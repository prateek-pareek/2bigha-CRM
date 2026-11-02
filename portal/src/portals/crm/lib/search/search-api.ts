import { CRM_API_URL } from '@/lib/crm/config';
import api from '@/lib/crm/api';
import {
  mapCrmListingToRecord,
  mapTwoBighaFarmToRecord,
  mapTwoBighaPropertyToRecord,
} from '@/lib/crm/property-listings/backend-api';
import type { PropertyListingRecord } from '@/lib/crm/property-listings/types';

export type CrmSearchResults = {
  leads?: Array<{
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    mobileNo?: string;
    phone?: string;
    whatsappNumber?: string;
    organization?: string;
    status?: string;
  }>;
  contacts?: Array<{
    _id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    mobileNo?: string;
    phone?: string;
  }>;
  organizations?: Array<{ _id: string; name?: string; industry?: string }>;
  clients?: Array<{
    _id: string;
    name?: string;
    email?: string;
    phone?: string;
    whatsappNumber?: string;
  }>;
  properties?: Array<{
    _id: string;
    title?: string;
    address?: string;
    city?: string;
    district?: string;
    village?: string;
    contactName?: string;
    contactPhone?: string;
    status?: string;
    propertyType?: string;
  }>;
};

/** First non-empty phone-ish value for result subtitles. */
export function searchResultPhone(r: {
  mobileNo?: string;
  phone?: string;
  whatsappNumber?: string;
  contactPhone?: string;
}): string | undefined {
  return r.mobileNo || r.phone || r.whatsappNumber || r.contactPhone || undefined;
}

export function propertySearchLocation(p: NonNullable<CrmSearchResults["properties"]>[number]): string {
  return [p.village, p.city || p.district].filter(Boolean).join(", ") || p.address || "";
}

type SearchProperty = NonNullable<CrmSearchResults["properties"]>[number];

function toSearchProperty(r: PropertyListingRecord): SearchProperty {
  return {
    _id: String(r._id),
    title: r.title,
    address: r.address,
    city: r.city,
    district: r.district,
    village: r.village,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    status: r.status,
    propertyType: r.propertyType,
  };
}

/**
 * Property Management data lives in 2bigha (live GraphQL), not the CRM database, so
 * search the same sources the Property Listings page reads: marketplace properties,
 * farms, and PM managed properties. Each source is best-effort — a slow or forbidden
 * source just contributes nothing.
 */
async function fetchPropertySearch(
  q: string,
  limit: number,
  signal?: AbortSignal,
  timeout = 12_000,
): Promise<SearchProperty[]> {
  const params = { page: 1, limit, searchTerm: q };
  const get = (url: string) =>
    api.get<{ data?: any[] } | null>(url, { params, signal, timeout });
  const [properties, farms, managed] = await Promise.allSettled([
    get("/crm/property-listings/twobigha/properties"),
    get("/crm/property-listings/twobigha/farms"),
    get("/crm/property-listings/twobigha/managed-properties"),
  ]);
  const rows = (
    res: PromiseSettledResult<{ data: { data?: any[] } | null }>,
    map: (raw: any) => PropertyListingRecord,
  ): SearchProperty[] => {
    if (res.status !== "fulfilled") return [];
    const list = res.value.data?.data;
    if (!Array.isArray(list)) return [];
    const out: SearchProperty[] = [];
    for (const raw of list) {
      try {
        out.push(toSearchProperty(map(raw)));
      } catch {
        /* skip malformed row */
      }
    }
    return out;
  };
  return [
    ...rows(managed, mapCrmListingToRecord),
    ...rows(properties, (raw) => mapTwoBighaPropertyToRecord(raw)),
    ...rows(farms, mapTwoBighaFarmToRecord),
  ];
}

function mergeProperties(...lists: Array<SearchProperty[] | undefined>): SearchProperty[] {
  const seen = new Set<string>();
  const out: SearchProperty[] = [];
  for (const list of lists) {
    for (const p of list || []) {
      if (!p?._id || seen.has(p._id)) continue;
      seen.add(p._id);
      out.push(p);
    }
  }
  return out;
}

export async function fetchCrmSearch(
  query: string,
  options?: { full?: boolean; signal?: AbortSignal },
): Promise<CrmSearchResults> {
  const q = query.trim();
  const params = new URLSearchParams({ q });
  if (options?.full) {
    params.set("full", "1");
  }
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const limit = options?.full ? 50 : 5;
  const [crmRes, liveProperties] = await Promise.all([
    fetch(`${CRM_API_URL}/crm/search?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: options?.signal,
    }),
    // Header dropdown waits less for 2bigha than the full results page.
    fetchPropertySearch(q, limit, options?.signal, options?.full ? 25_000 : 8_000).catch(
      () => [] as SearchProperty[],
    ),
  ]);
  if (!crmRes.ok) {
    throw new Error("Search failed");
  }
  const data = (await crmRes.json()) as CrmSearchResults;
  return {
    ...data,
    properties: mergeProperties(liveProperties, data.properties).slice(0, limit * 3),
  };
}

export function crmSearchHasResults(data: CrmSearchResults | null | undefined) {
  if (!data) return false;
  return (
    (data.leads?.length ?? 0) > 0 ||
    (data.contacts?.length ?? 0) > 0 ||
    (data.organizations?.length ?? 0) > 0 ||
    (data.clients?.length ?? 0) > 0 ||
    (data.properties?.length ?? 0) > 0
  );
}
