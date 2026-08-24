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
  return request<{
    data: PropertyListingRecord[];
    total: number;
    page: number;
    pageSize: number;
  }>(
    `/v1/properties${toQuery({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: query.status,
      approvalStatus: query.approvalStatus,
      listedFor: query.listedFor,
      leadId: query.leadId,
      listingBucket: query.listingBucket,
      pmStage: query.pmStage,
      legalStatus: query.legalStatus,
    })}`,
  );
}

export async function httpFetchById(id: string): Promise<PropertyListingRecord | null> {
  try {
    return await request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

export async function httpFetchStats(listingBucket?: string) {
  return request<PropertyListingStats>(
    `/v1/properties/stats${toQuery({ listingBucket })}`,
  );
}

export async function httpCreate(input: CreateThirdPartyPropertyInput) {
  return request<PropertyListingRecord>("/v1/properties", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function httpUpdate(id: string, input: UpdateThirdPartyPropertyInput) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function httpDelete(id: string): Promise<void> {
  await request(`/v1/properties/${encodeURIComponent(id)}`, { method: "DELETE" });
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
