/**
 * Property Management (PM) pipeline API facade.
 *
 * Mirrors @/lib/crm/property-listings/third-party-api's mock/HTTP switch —
 * UI should import PM pipeline actions from this module only.
 */

export { PM_RM_POOL, PM_LEGAL_POOL, PM_FIELD_POOL } from "./mock-pm";

import { useThirdPartyListingsMock } from "@/lib/crm/property-listings/third-party-config";
import * as mock from "./mock-pm";
import * as http from "./http-pm";
import type { PmChecklistItem, PmVisitStatus } from "./types";

const mockMode = () => useThirdPartyListingsMock();

export async function assignPmToRm(id: string, rmName: string) {
  return mockMode() ? mock.assignPmToRm(id, rmName) : http.httpAssignRm(id, rmName);
}

export async function assignPmToLegal(id: string, legalName: string) {
  return mockMode() ? mock.assignPmToLegal(id, legalName) : http.httpAssignLegal(id, legalName);
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

export async function assignPmToFieldAgent(id: string, fieldName: string, scheduledAt?: string) {
  return mockMode()
    ? mock.assignPmToFieldAgent(id, fieldName, scheduledAt)
    : http.httpAssignField(id, fieldName, scheduledAt);
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
