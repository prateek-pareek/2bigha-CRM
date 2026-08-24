/**
 * Mock PM pipeline mutations (in-memory + localStorage).
 *
 * PM cases live in the same third-party listings collection as marketplace
 * listings (see @/lib/crm/property-listings/mock-third-party) — this file
 * only owns the RM → Legal → Field Agent workflow actions on top of that
 * shared store's generic patch/fetch helpers.
 */

import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";
import {
  fetchThirdPartyPropertyById,
  patchPropertyListing,
} from "@/lib/crm/property-listings/mock-third-party";
import type { PmChecklistItem, PmVisitStatus } from "./types";
import { DEFAULT_LEGAL_CHECKLIST, DEFAULT_REPORT_SECTIONS } from "./types";

export const PM_RM_POOL = ["Asha Mehta (RM)", "Ravi Sharma (RM)"];
export const PM_LEGAL_POOL = ["Priya Desai (Legal)", "Ankit Verma (Legal)"];
export const PM_FIELD_POOL = ["Suresh Yadav (Field)", "Neha Singh (Field)"];

/** RM takes ownership after property is submitted. */
export async function assignPmToRm(id: string, rmName: string): Promise<PropertyListingRecord> {
  return patchPropertyListing(id, {
    rmAssigneeName: rmName,
    pmStage: "Assigned to RM",
  });
}

/** RM assigns Legal Manager. */
export async function assignPmToLegal(
  id: string,
  legalName: string,
): Promise<PropertyListingRecord> {
  return patchPropertyListing(id, {
    legalAssigneeName: legalName,
    pmStage: "Assigned to Legal",
    legalVerification: {
      status: "Not started",
      checklist: structuredClone(DEFAULT_LEGAL_CHECKLIST),
    },
  });
}

export async function startPmLegalVerification(
  id: string,
  summary?: string,
): Promise<PropertyListingRecord> {
  const current = await fetchThirdPartyPropertyById(id);
  if (!current) throw new Error("Listing not found");
  return patchPropertyListing(id, {
    legalVerification: {
      status: "In progress",
      startedAt: new Date().toISOString(),
      summary: summary || current.legalVerification?.summary,
      checklist: current.legalVerification?.checklist || structuredClone(DEFAULT_LEGAL_CHECKLIST),
    },
  });
}

export async function updatePmLegalChecklist(
  id: string,
  checklist: PmChecklistItem[],
  summary?: string,
): Promise<PropertyListingRecord> {
  const current = await fetchThirdPartyPropertyById(id);
  if (!current) throw new Error("Listing not found");
  return patchPropertyListing(id, {
    legalVerification: {
      ...(current.legalVerification || { status: "In progress", checklist: [] }),
      status: current.legalVerification?.status === "Completed" ? "Completed" : "In progress",
      checklist,
      summary: summary ?? current.legalVerification?.summary,
    },
  });
}

export async function completePmLegalVerification(
  id: string,
  summary?: string,
): Promise<PropertyListingRecord> {
  const current = await fetchThirdPartyPropertyById(id);
  if (!current) throw new Error("Listing not found");
  return patchPropertyListing(id, {
    legalVerification: {
      status: "Completed",
      startedAt: current.legalVerification?.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: summary || current.legalVerification?.summary || "Verification complete",
      checklist: current.legalVerification?.checklist || structuredClone(DEFAULT_LEGAL_CHECKLIST),
    },
  });
}

/** RM assigns Field Agent after legal review. */
export async function assignPmToFieldAgent(
  id: string,
  fieldName: string,
  scheduledAt?: string,
): Promise<PropertyListingRecord> {
  return patchPropertyListing(id, {
    fieldAssigneeName: fieldName,
    pmStage: "Assigned to Field Agent",
    fieldVisit: {
      status: "Pending",
      scheduledAt: scheduledAt || new Date(Date.now() + 2 * 86400000).toISOString(),
    },
  });
}

export async function setPmFieldVisitStatus(
  id: string,
  status: PmVisitStatus,
  notes?: string,
): Promise<PropertyListingRecord> {
  const current = await fetchThirdPartyPropertyById(id);
  if (!current) throw new Error("Listing not found");
  const now = new Date().toISOString();
  return patchPropertyListing(id, {
    fieldVisit: {
      status,
      scheduledAt: current.fieldVisit?.scheduledAt,
      completedAt: status === "Complete" ? now : current.fieldVisit?.completedAt,
      notes: notes ?? current.fieldVisit?.notes,
    },
  });
}

export async function submitPmVisitReport(id: string): Promise<PropertyListingRecord> {
  const current = await fetchThirdPartyPropertyById(id);
  if (!current) throw new Error("Listing not found");
  return patchPropertyListing(id, {
    pmStage: "Visit Report Pending",
    fieldVisit: {
      ...(current.fieldVisit || { status: "Complete" }),
      status: "Complete",
      completedAt: current.fieldVisit?.completedAt || new Date().toISOString(),
    },
    visitReport: {
      status: "Pending",
      submittedAt: new Date().toISOString(),
      sections: structuredClone(DEFAULT_REPORT_SECTIONS).map((s) => ({ ...s, checked: true })),
    },
  });
}

export async function reviewPmVisitReport(
  id: string,
  decision: "Approved" | "Rejected",
  rejectionReason?: string,
  sections?: PmChecklistItem[],
): Promise<PropertyListingRecord> {
  const current = await fetchThirdPartyPropertyById(id);
  if (!current) throw new Error("Listing not found");
  return patchPropertyListing(id, {
    pmStage: decision === "Approved" ? "Visit Report Approved" : "Visit Report Rejected",
    visitReport: {
      status: decision,
      submittedAt: current.visitReport?.submittedAt || new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      rejectionReason: decision === "Rejected" ? rejectionReason : undefined,
      sections: sections || current.visitReport?.sections || structuredClone(DEFAULT_REPORT_SECTIONS),
    },
  });
}
