/**
 * PM workflow HTTP adapter — Nest CRM API (legal, field visit, report review).
 * Assignment actions live in assignment-api.ts.
 */

import api from "@/lib/crm/api";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";
import type { PmChecklistItem, PmVisitStatus } from "./types";

function listingPath(id: string, suffix: string) {
  return `/crm/property-listings/${encodeURIComponent(id)}/pm/${suffix}`;
}

export async function httpStartLegal(id: string, summary?: string) {
  const { data } = await api.post<PropertyListingRecord>(listingPath(id, "legal/start"), {
    summary,
  });
  return { ...data, _id: String(data?._id || id), listingBucket: data?.listingBucket || "pm" };
}

export async function httpUpdateLegalChecklist(
  id: string,
  checklist: PmChecklistItem[],
  summary?: string,
) {
  const { data } = await api.put<PropertyListingRecord>(listingPath(id, "legal/checklist"), {
    checklist,
    summary,
  });
  return { ...data, _id: String(data?._id || id), listingBucket: data?.listingBucket || "pm" };
}

export async function httpCompleteLegal(id: string, summary?: string) {
  const { data } = await api.post<PropertyListingRecord>(listingPath(id, "legal/complete"), {
    summary,
  });
  return { ...data, _id: String(data?._id || id), listingBucket: data?.listingBucket || "pm" };
}

export async function httpScheduleVisit(
  id: string,
  agentId: string,
  scheduledAt: string,
  notes?: string,
) {
  const { data } = await api.post<PropertyListingRecord>(listingPath(id, "visit/schedule"), {
    agentId,
    scheduledAt,
    notes,
  });
  return { ...data, _id: String(data?._id || id), listingBucket: data?.listingBucket || "pm" };
}

export async function httpVisitStatus(id: string, status: PmVisitStatus, notes?: string) {
  const { data } = await api.post<PropertyListingRecord>(listingPath(id, "visit/status"), {
    status,
    notes,
  });
  return { ...data, _id: String(data?._id || id), listingBucket: data?.listingBucket || "pm" };
}

export async function httpSubmitVisitReport(id: string) {
  const { data } = await api.post<PropertyListingRecord>(listingPath(id, "visit/report/submit"));
  return { ...data, _id: String(data?._id || id), listingBucket: data?.listingBucket || "pm" };
}

export async function httpReviewVisitReport(
  id: string,
  decision: "Approved" | "Rejected" | "Changes Requested",
  rejectionReason?: string,
  sections?: PmChecklistItem[],
) {
  const { data } = await api.post<PropertyListingRecord>(listingPath(id, "visit/report/review"), {
    decision,
    rejectionReason,
    sections,
  });
  return { ...data, _id: String(data?._id || id), listingBucket: data?.listingBucket || "pm" };
}
