/**
 * Property Management (PM) pipeline API facade.
 *
 * Mirrors @/lib/crm/property-listings/third-party-api's mock/HTTP switch —
 * UI should import PM pipeline actions from this module only.
 */

export { PM_RM_POOL, PM_LEGAL_POOL, PM_FIELD_POOL } from "./mock-pm";
export {
  fetchPmAssignmentStaff,
  assignPmStaff,
  type PmAssignPick,
  type PmAssignmentStaffResponse,
  type PmStaffPerson,
} from "./assignment-api";

import { useThirdPartyListingsMock } from "@/lib/crm/property-listings/third-party-config";
import * as mock from "./mock-pm";
import * as live from "./assignment-api";
import type { PmChecklistItem, PmVisitStatus } from "./types";
import type { PmAssignPick } from "./assignment-api";
import type { PropertyListingRecord } from "@/lib/crm/property-listings/types";
import * as http from "./http-pm";

function isDemoListingId(id: string) {
  return id.startsWith("tp_listing_") || id.startsWith("mock_");
}

const mockMode = () => useThirdPartyListingsMock();

function unwrapListing(result: { listing: PropertyListingRecord; twobigha?: { status?: string; message?: string } } | PropertyListingRecord) {
  if (result && typeof result === "object" && "listing" in result && result.listing) {
    return {
      ...result.listing,
      pmAssignmentSyncStatus: result.listing.pmAssignmentSyncStatus || result.twobigha?.status,
      pmAssignmentSyncError: result.listing.pmAssignmentSyncError || result.twobigha?.message,
    };
  }
  return result as PropertyListingRecord;
}

export async function assignPmToRm(id: string, pick: string | PmAssignPick) {
  const payload: PmAssignPick =
    typeof pick === "string" ? { source: "twobigha", id: pick, name: pick } : pick;
  if (mockMode() || isDemoListingId(id)) {
    return mock.assignPmToRm(id, payload.name);
  }
  const result = await live.assignPmStaff(id, "manager", payload);
  return unwrapListing(result);
}

export async function assignPmToLegal(id: string, pick: string | PmAssignPick) {
  const payload: PmAssignPick =
    typeof pick === "string" ? { source: "twobigha", id: pick, name: pick } : pick;
  if (mockMode() || isDemoListingId(id)) {
    return mock.assignPmToLegal(id, payload.name);
  }
  const result = await live.assignPmStaff(id, "legal", payload);
  return unwrapListing(result);
}

export async function assignPmToFieldAgent(
  id: string,
  pick: string | PmAssignPick,
  scheduledAt?: string,
) {
  const payload: PmAssignPick =
    typeof pick === "string" ? { source: "twobigha", id: pick, name: pick } : pick;
  if (mockMode() || isDemoListingId(id)) {
    return mock.assignPmToFieldAgent(id, payload.name, scheduledAt);
  }
  const result = await live.assignPmStaff(id, "field", payload);
  return unwrapListing(result);
}

export async function unassignPmStaff(id: string, role: live.PmAssignRole) {
  if (mockMode() || isDemoListingId(id)) {
    return { listing: await mock.unassignPmRole(id, role), twobigha: { status: "mock" as const } };
  }
  return live.unassignPmStaff(id, role);
}

export async function startPmLegalVerification(id: string, summary?: string) {
  return mockMode()
    ? mock.startPmLegalVerification(id, summary)
    : http.httpStartLegal(id, summary);
}

export async function updatePmLegalChecklist(
  id: string,
  checklist: PmChecklistItem[],
  summary?: string,
) {
  return mockMode()
    ? mock.updatePmLegalChecklist(id, checklist, summary)
    : http.httpUpdateLegalChecklist(id, checklist, summary);
}

export async function completePmLegalVerification(id: string, summary?: string) {
  return mockMode()
    ? mock.completePmLegalVerification(id, summary)
    : http.httpCompleteLegal(id, summary);
}

export async function setPmFieldVisitStatus(id: string, status: PmVisitStatus, notes?: string) {
  return mockMode()
    ? mock.setPmFieldVisitStatus(id, status, notes)
    : http.httpVisitStatus(id, status, notes);
}

export async function submitPmVisitReport(id: string) {
  return mockMode() ? mock.submitPmVisitReport(id) : http.httpSubmitVisitReport(id);
}

export async function reviewPmVisitReport(
  id: string,
  decision: "Approved" | "Rejected",
  rejectionReason?: string,
  sections?: PmChecklistItem[],
) {
  return mockMode()
    ? mock.reviewPmVisitReport(id, decision, rejectionReason, sections)
    : http.httpReviewVisitReport(id, decision, rejectionReason, sections);
}

export async function fetchLivePmStatus(id: string) {
  if (mockMode() || isDemoListingId(id)) {
    return null;
  }
  try {
    return await http.httpGetLivePmStatus(id);
  } catch {
    return null;
  }
}

export async function fetchVisitReportDetail(reportId: number) {
  try {
    return await http.httpGetVisitReportDetail(reportId);
  } catch {
    return null;
  }
}
