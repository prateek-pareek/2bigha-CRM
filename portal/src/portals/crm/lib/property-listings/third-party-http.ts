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
  const { data } = await api.get<{
    data: any[];
    meta?: { page?: number; limit?: number; total?: number; totalPages?: number };
  }>("/crm/property-listings/twobigha/properties", {
    params: {
      page: query.page,
      limit: query.pageSize,
      searchTerm: query.search,
      status: query.status,
    },
  });

  const rows = data?.data || [];
  const mapped = rows.map((r: any) => mapTwoBighaPropertyToRecord(r));

  return {
    data: mapped,
    total: data?.meta?.total ?? mapped.length,
    page: data?.meta?.page ?? Number(query.page || 1),
    pageSize: data?.meta?.limit ?? Number(query.pageSize || 25),
  };
}

export async function httpFetchById(id: string): Promise<PropertyListingRecord | null> {
  try {
    const { data } = await api.get<PropertyListingRecord>(`/crm/property-listings/${id}`);
    return data;
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
  const { data } = await api.post<PropertyListingRecord>("/crm/property-listings", input);
  return data;
}

export async function httpUpdate(id: string, input: UpdateThirdPartyPropertyInput) {
  const { data } = await api.put<PropertyListingRecord>(`/crm/property-listings/${id}`, input);
  return data;
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
