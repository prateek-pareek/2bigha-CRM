/**
 * HTTP adapter for the PM pipeline — same base URL/auth and `request()`
 * helper as @/lib/crm/property-listings/third-party-http, PM-only paths.
 *
 * Expected REST surface (relative to NEXT_PUBLIC_2BIGHA_LISTINGS_API_URL):
 *   POST  /v1/properties/:id/assign-rm
 *   POST  /v1/properties/:id/assign-legal
 *   POST  /v1/properties/:id/legal/start
 *   PUT   /v1/properties/:id/legal/checklist
 *   POST  /v1/properties/:id/legal/complete
 *   POST  /v1/properties/:id/assign-field
 *   POST  /v1/properties/:id/visit/status
 *   POST  /v1/properties/:id/visit/report
 *   POST  /v1/properties/:id/visit/report/review
 */

import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";
import { request } from "@/lib/crm/property-listings/third-party-http";
import type { PmChecklistItem, PmVisitStatus } from "./types";

export async function httpAssignRm(id: string, rmName: string) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}/assign-rm`, {
    method: "POST",
    body: JSON.stringify({ rmName }),
  });
}

export async function httpAssignLegal(id: string, legalName: string) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}/assign-legal`, {
    method: "POST",
    body: JSON.stringify({ legalName }),
  });
}

export async function httpStartLegal(id: string, summary?: string) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}/legal/start`, {
    method: "POST",
    body: JSON.stringify({ summary }),
  });
}

export async function httpUpdateLegalChecklist(
  id: string,
  checklist: PmChecklistItem[],
  summary?: string,
) {
  return request<PropertyListingRecord>(
    `/v1/properties/${encodeURIComponent(id)}/legal/checklist`,
    { method: "PUT", body: JSON.stringify({ checklist, summary }) },
  );
}

export async function httpCompleteLegal(id: string, summary?: string) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}/legal/complete`, {
    method: "POST",
    body: JSON.stringify({ summary }),
  });
}

export async function httpAssignField(id: string, fieldName: string, scheduledAt?: string) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}/assign-field`, {
    method: "POST",
    body: JSON.stringify({ fieldName, scheduledAt }),
  });
}

export async function httpVisitStatus(id: string, status: PmVisitStatus, notes?: string) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}/visit/status`, {
    method: "POST",
    body: JSON.stringify({ status, notes }),
  });
}

export async function httpSubmitVisitReport(id: string) {
  return request<PropertyListingRecord>(`/v1/properties/${encodeURIComponent(id)}/visit/report`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function httpReviewVisitReport(
  id: string,
  decision: "Approved" | "Rejected",
  rejectionReason?: string,
  sections?: PmChecklistItem[],
) {
  return request<PropertyListingRecord>(
    `/v1/properties/${encodeURIComponent(id)}/visit/report/review`,
    { method: "POST", body: JSON.stringify({ decision, rejectionReason, sections }) },
  );
}
