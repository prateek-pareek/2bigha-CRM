/**
 * HTTP adapter for the third-party listings API.
 * Paths match the mock client so flipping the base URL is enough to go live.
 *
 * Expected REST surface (relative to NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL):
 *   GET/POST          /v1/properties
 *   GET/PUT/DELETE    /v1/properties/:id
 *   GET               /v1/properties/stats
 *   GET               /v1/leads/:leadId/subscription
 *   GET               /v1/legal-verifications
 *   POST              /v1/legal-verifications/request-batch
 *   POST              /v1/properties/:id/legal-verification/request
 *   POST              /v1/properties/:id/legal-verification/assign
 *   POST              /v1/properties/:id/legal-verification/decide
 *   POST              /v1/properties/:id/legal-verification/notes
 *   POST              /v1/properties/:id/legal-verification/report
 *
 * PM pipeline endpoints (assign-rm, assign-legal, legal/*, assign-field,
 * visit/*) live in @/lib/crm/property-management/http-pm — same base URL,
 * same `request()` helper (exported below), separate module.
 */

import api from "../api";
import { mapTwoBighaPropertyToRecord } from "./backend-api";

import type {
  LeadSubscriptionMock,
  PropertyLegalStatus,
  PropertyListingRecord,
  PropertyListingStats,
} from "./types";
import {
  THIRD_PARTY_LISTINGS_API_URL,
  thirdPartyListingsAuthHeaders,
} from "./third-party-config";
import type {
  CreateThirdPartyPropertyInput,
  ThirdPartyListQuery,
  UpdateThirdPartyPropertyInput,
} from "./mock-third-party";

/** Shared by @/lib/crm/property-management/http-pm — same base URL/auth, PM-only paths. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${THIRD_PARTY_LISTINGS_API_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...thirdPartyListingsAuthHeaders(),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { message?: string })?.message ||
      `Third-party listings API error (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

function mapLocalListing(item: any): PropertyListingRecord {
  return {
    _id: String(item._id),
    listingBucket: item.listingBucket || (item.propertyType === "Farm" ? "farm" : "properties"),
    title: item.title,
    address: item.address,
    city: item.city,
    state: item.state,
    district: item.district,
    village: item.village,
    tehsil: item.tehsil,
    country: item.country || "India",
    zipCode: item.zipCode,
    price: item.price || 0,
    currency: item.currency || "INR",
    propertyType: item.propertyType || "Plot",
    listedFor: item.listedFor || "Sale",
    areaSqft: item.areaSqft,
    areaValue: item.areaValue,
    areaUnit: item.areaUnit,
    status: item.status || "Available",
    approvalStatus: item.approvalStatus || "Approved",
    verified: Boolean(item.userPropertyId || item.twobighaPropertyId),
    images: Array.isArray(item.images) ? item.images : [],
    amenities: item.amenities || [],
    description: item.description,
    khasraNumber: item.khasraNumber,
    googleMapsLink: item.googleMapsLink,
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    contactEmail: item.contactEmail,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    twobighaPropertyId: item.twobighaPropertyId,
    twobighaSyncStatus: item.twobighaSyncStatus,
    twobighaSyncError: item.twobighaSyncError,
    userPropertyId: item.userPropertyId,
    leadId: item.leadId ? String(item.leadId) : undefined,
    pmPlan: item.pmPlan,
    pmStage: item.pmStage,
    rmAssigneeId: item.rmAssigneeId,
    rmAssigneeName: item.rmAssigneeName,
    legalAssigneeId: item.legalAssigneeId,
    legalAssigneeName: item.legalAssigneeName,
    fieldAssigneeId: item.fieldAssigneeId,
    fieldAssigneeName: item.fieldAssigneeName,
    pmAssignmentSyncStatus: item.pmAssignmentSyncStatus,
    pmAssignmentSyncError: item.pmAssignmentSyncError,
  };
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === "all") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function httpFetchListings(query: ThirdPartyListQuery = {}) {
  let mapped: PropertyListingRecord[] = [];
  let total = 0;
  const bucket = query.listingBucket;

  if (bucket === "pm") {
    try {
      const { data } = await api.get<{
        data?: any[];
        total?: number;
        page?: number;
        pageSize?: number;
      }>("/crm/property-listings/twobigha/managed-properties", {
        params: {
          page: query.page,
          limit: query.pageSize,
          searchTerm: query.search,
          planName: query.pmPlan && query.pmPlan !== "all" ? query.pmPlan : undefined,
          pmStage: query.pmStage && query.pmStage !== "all" ? query.pmStage : undefined,
        },
      });
      mapped = (data?.data || []).map(mapLocalListing);
      total = data?.total ?? mapped.length;
    } catch (err) {
      console.warn("2bigha managed properties fetch error:", err);
    }

    try {
      const { data: localRes } = await api.get<{ data: any[]; total: number }>(
        "/crm/property-listings",
        {
          params: {
            page: 1,
            pageSize: 50,
            search: query.search,
            listingBucket: "pm",
            pmStage: query.pmStage,
          },
        },
      );
      const liveKeys = new Set(
        mapped.flatMap((row) => [row._id, row.userPropertyId, row.twobighaPropertyId].filter(Boolean)),
      );
      for (const loc of (localRes?.data || []).map(mapLocalListing)) {
        if (liveKeys.has(loc._id) || (loc.userPropertyId && liveKeys.has(loc.userPropertyId))) {
          continue;
        }
        mapped.unshift(loc);
        total += 1;
      }
    } catch (localErr) {
      console.warn("CRM PM listings fetch error:", localErr);
    }

    return {
      data: mapped,
      total,
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 25),
    };
  }

  try {
    const { data } = await api.get<{
      data: any[];
      meta?: { page?: number; limit?: number; total?: number; totalPages?: number };
    }>("/crm/property-listings/twobigha/properties", {
      params: {
        page: query.page,
        limit: query.pageSize,
        searchTerm: query.search,
        status: query.status,
        approvalStatus: query.approvalStatus,
        priceOrder: query.priceOrder,
        newlyCreated: query.newlyCreated,
        lat: query.lat,
        lng: query.lng,
      },
    });

    const rows = data?.data || [];
    mapped = rows.map((r: any) => mapTwoBighaPropertyToRecord(r));
    total = data?.meta?.total ?? mapped.length;
  } catch (err) {
    console.warn("2bigha live properties fetch error:", err);
  }

  // Also include listings saved in CRM / synced to 2bigha
  try {
    const { data: localRes } = await api.get<{
      data: any[];
      total: number;
    }>("/crm/property-listings", {
      params: {
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        status: query.status !== "all" ? query.status : undefined,
        listingBucket: bucket && bucket !== "all" ? bucket : undefined,
        leadId: query.leadId,
        pmStage: query.pmStage,
      },
    });

    if (localRes?.data && localRes.data.length > 0) {
      const localMapped: PropertyListingRecord[] = localRes.data.map(mapLocalListing);
      const existingIds = new Set(mapped.map((m) => m._id));
      for (const loc of localMapped) {
        if (!existingIds.has(loc._id) && (!loc.twobighaPropertyId || !existingIds.has(loc.twobighaPropertyId))) {
          mapped.unshift(loc);
          total += 1;
        }
      }
    }
  } catch (localErr) {
    console.warn("CRM property listings fetch error:", localErr);
  }

  return {
    data: mapped,
    total,
    page: Number(query.page || 1),
    pageSize: Number(query.pageSize || 25),
  };
}

export async function httpFetchById(id: string): Promise<PropertyListingRecord | null> {
  if (id.startsWith("pm_")) {
    try {
      const { data } = await api.get<any>(
        `/crm/property-listings/twobigha/managed-properties/${encodeURIComponent(id)}`,
      );
      return data ? mapLocalListing(data) : null;
    } catch {
      return null;
    }
  }
  try {
    const { data } = await api.get<any>(`/crm/property-listings/${id}`);
    return data ? mapLocalListing(data) : null;
  } catch {
    return null;
  }
}

export async function httpFetchStats(listingBucket?: string) {
  const { data } = await api.get<PropertyListingStats>("/crm/property-listings/stats", {
    params: { listingBucket },
  });
  return data;
}

export async function httpCreate(input: CreateThirdPartyPropertyInput) {
  const { data } = await api.post<any>("/crm/property-listings", input);
  return mapLocalListing(data);
}

export async function httpUpdate(id: string, input: UpdateThirdPartyPropertyInput) {
  const { data } = await api.put<any>(`/crm/property-listings/${id}`, input);
  return mapLocalListing(data);
}

export async function httpDelete(id: string): Promise<void> {
  await api.delete(`/crm/property-listings/${id}`);
}

export async function httpLeadSubscription(leadId: string) {
  return request<LeadSubscriptionMock | null>(
    `/v1/leads/${encodeURIComponent(leadId)}/subscription`,
  );
}

export async function httpFetchLegalVerificationQueue(query: ThirdPartyListQuery = {}) {
  return request<{
    data: PropertyListingRecord[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/v1/legal-verifications${toQuery({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      legalStatus: query.legalStatus,
      listingBucket: query.listingBucket,
      legalSort: query.legalSort,
      legalRequestedAfter: query.legalRequestedAfter,
      legalAssignee: query.legalAssignee,
    })}`,
  );
}

export async function httpRequestPropertyLegalVerification(propertyId: string) {
  return request<PropertyListingRecord>(
    `/v1/properties/${encodeURIComponent(propertyId)}/legal-verification/request`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function httpRequestPropertyLegalVerificationBatch(propertyIds: string[]) {
  return request<{
    ok: PropertyListingRecord[];
    errors: { id: string; message: string }[];
  }>(`/v1/legal-verifications/request-batch`, {
    method: "POST",
    body: JSON.stringify({ propertyIds }),
  });
}

export async function httpAssignPropertyLegalReviewer(propertyId: string, assignedTo: string) {
  return request<PropertyListingRecord>(
    `/v1/properties/${encodeURIComponent(propertyId)}/legal-verification/assign`,
    { method: "POST", body: JSON.stringify({ assignedTo }) },
  );
}

export async function httpDecidePropertyLegalVerification(
  propertyId: string,
  input: {
    status: PropertyLegalStatus;
    reviewedBy?: string;
    notes?: string;
    rejectionReason?: string;
  },
) {
  return request<PropertyListingRecord>(
    `/v1/properties/${encodeURIComponent(propertyId)}/legal-verification/decide`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function httpAddPropertyLegalNote(
  propertyId: string,
  text: string,
  by?: string,
) {
  return request<PropertyListingRecord>(
    `/v1/properties/${encodeURIComponent(propertyId)}/legal-verification/notes`,
    { method: "POST", body: JSON.stringify({ text, by }) },
  );
}

export async function httpAttachPropertyLegalReport(
  propertyId: string,
  fileName: string,
  url?: string,
) {
  return request<PropertyListingRecord>(
    `/v1/properties/${encodeURIComponent(propertyId)}/legal-verification/report`,
    { method: "POST", body: JSON.stringify({ fileName, url }) },
  );
}
