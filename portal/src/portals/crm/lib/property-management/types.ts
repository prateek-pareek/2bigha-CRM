/**
 * Property Management (PM) — subscription verification pipeline.
 *
 * PM is its own module (routes under /crm/property-management, own nav
 * entry, own components/lib), separate from the Buy/Sell/Farm marketplace
 * in @/lib/crm/property-listings. The two still share one underlying
 * record: a PM case is a `PropertyListingRecord` (see
 * @/lib/crm/property-listings/types) with `listingBucket: "pm"`, backed by
 * the same third-party listings store — this file only owns PM's own
 * pipeline vocabulary, not the shared record shape.
 */

import type {
  PropertyListingType,
  PropertyStatusBadgeTone,
} from "@/lib/crm/property-listings/types";

/** PM pipeline stages (from 2Bigha PM Process Flow). */
export type PmPipelineStage =
  | "Property Submitted"
  | "Assigned to RM"
  | "Assigned to Legal"
  | "Assigned to Field Agent"
  | "Visit Report Pending"
  | "Visit Report Approved"
  | "Visit Report Rejected";

export const PM_PIPELINE_STAGES: PmPipelineStage[] = [
  "Property Submitted",
  "Assigned to RM",
  "Assigned to Legal",
  "Assigned to Field Agent",
  "Visit Report Pending",
  "Visit Report Approved",
  "Visit Report Rejected",
];

/** High-level pipeline steps shown in the stage rail (doc §4). */
export const PM_STAGE_RAIL: { key: string; match: PmPipelineStage[] }[] = [
  { key: "Property Submitted", match: ["Property Submitted"] },
  { key: "Assigned to RM", match: ["Assigned to RM"] },
  { key: "Assigned to Legal", match: ["Assigned to Legal"] },
  { key: "Assigned to Field Agent", match: ["Assigned to Field Agent"] },
  {
    key: "Visit Report",
    match: ["Visit Report Pending", "Visit Report Approved", "Visit Report Rejected"],
  },
];

export type PmLegalStatus = "Not started" | "In progress" | "Completed";
export type PmVisitStatus = "Pending" | "Complete" | "Cancel";
export type PmReportStatus = "Pending" | "Approved" | "Rejected" | "Changes Requested";

export interface PmChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  note?: string;
}

export interface PmLegalVerification {
  status: PmLegalStatus;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  checklist: PmChecklistItem[];
}

export interface PmFieldVisit {
  status: PmVisitStatus;
  scheduledAt?: string;
  completedAt?: string;
  notes?: string;
}

export interface PmVisitReport {
  status: PmReportStatus;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  sections: PmChecklistItem[];
}

export const DEFAULT_LEGAL_CHECKLIST: PmChecklistItem[] = [
  { id: "title_deed", label: "Title deed / ownership docs", checked: false },
  { id: "khasra", label: "Khasra / land records match", checked: false },
  { id: "encumbrance", label: "Encumbrance / lien check", checked: false },
  { id: "boundary", label: "Boundary / survey consistency", checked: false },
];

export const DEFAULT_REPORT_SECTIONS: PmChecklistItem[] = [
  { id: "location", label: "Location & access verified", checked: false },
  { id: "boundaries", label: "Boundaries / markers", checked: false },
  { id: "photos", label: "Site photos captured", checked: false },
  { id: "owner", label: "Owner / occupant confirmation", checked: false },
];

export const PM_PLANS = ["Basic", "Standard", "Premium", "Featured"] as const;
export type PmPlan = (typeof PM_PLANS)[number];

export const PM_PROPERTY_TYPES: PropertyListingType[] = [
  "Commercial",
  "Residential",
  "Agricultural",
  "Industrial",
  "Apartment",
  "Office",
  "Plot",
  "Villa",
  "Warehouse",
  "Farmhouse",
  "Farmland",
  "Other",
];

export function pmStageBadgeTone(stage: string): PropertyStatusBadgeTone {
  const s = stage.toLowerCase();
  if (s.includes("approved")) return "success";
  if (s.includes("rejected")) return "neutral";
  if (s.includes("legal") || s.includes("field") || s.includes("visit")) return "info";
  if (s.includes("rm")) return "warning";
  return "warning";
}
