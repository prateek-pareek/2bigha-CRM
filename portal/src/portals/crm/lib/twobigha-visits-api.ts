import api from "@/lib/crm/api";

/**
 * Read-only client for 2bigha Visit Tracking & History (handbook §4),
 * proxied through NestJS `/crm/visits` → TwoBighaVisitsService.
 * The frontend never talks to 2bigha's GraphQL endpoint directly.
 */

export type FieldVisitStatus =
  | "SCHEDULED"
  | "AGENT_ON_WAY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "MISSED"
  | "CANCELLED";

export type VisitReportStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REJECTED";

export type VisitRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CLOSED" | "SCHEDULED";

export type VisitCategory = "PRE_VERIFICATION" | "REGULAR" | "MAINTENANCE" | "EMERGENCY" | string;

export interface TwoBighaUserMini {
  userId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  role?: string;
}

export interface AdminMini {
  adminId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface VisitRequestProperty {
  propertyId?: string;
  title?: string;
  propertyName?: string;
  description?: string;
  propertyType?: string;
  status?: string;
  price?: number;
  area?: number;
  areaUnit?: string;
  khasraNumber?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  latLng?: string;
}

export interface FieldVisitReportSummary {
  reportId?: number;
  status?: VisitReportStatus;
  submittedAt?: string;
  reviewedAt?: string;
}

export interface FieldVisitAgentAssigned {
  adminId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface FieldVisit {
  id: string;
  visitRequestId?: number;
  userPropertyId?: string;
  agentId?: string;
  visitCategory?: VisitCategory;
  status?: FieldVisitStatus;
  countsTowardLimit?: boolean;
  scheduledAt?: string;
  checkInAt?: string;
  checkInLat?: string;
  checkInLng?: string;
  checkOutAt?: string;
  checkOutLat?: string;
  checkOutLng?: string;
  durationMinutes?: number;
  notes?: string;
  locationMatchCheck?: string;
  propertyAccessible?: boolean;
  createdAt?: string;
  updatedAt?: string;
  owner?: TwoBighaUserMini | null;
  property?: VisitRequestProperty | null;
  report?: FieldVisitReportSummary | null;
  agentAssigned?: FieldVisitAgentAssigned | null;
}

export interface VisitRequestMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FieldVisitStatusCounts {
  total: number;
  scheduled: number;
  agentOnWay: number;
  inProgress: number;
  completed: number;
  missed: number;
  cancelled: number;
}

export interface FieldVisitListResult {
  meta: VisitRequestMeta;
  stats?: FieldVisitStatusCounts | null;
  rows: FieldVisit[];
}

export interface FieldVisitDetailed {
  fieldVisit: FieldVisit;
  agent?: AdminMini | null;
  property?: unknown;
  owner?: TwoBighaUserMini | null;
  manager?: AdminMini | null;
  request?: unknown;
  report?: unknown;
}

export interface VisitReportDetail {
  reportId?: string;
  conditionRating?: number;
  observations?: string;
  issuesFound?: unknown;
  recommendations?: string;
  checklistResponses?: unknown;
  reportStatus?: VisitReportStatus;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  reviewedBy?: AdminMini | null;
  aiReport?: unknown;
  sectionReviews?: unknown;
  resubmissionCount?: number;
}

export interface VisitReport {
  visitId: string;
  scheduledAt?: string;
  checkInAt?: string;
  checkOutAt?: string;
  durationMinutes?: number;
  visitCategory?: string;
  fieldVisitStatus?: string;
  notes?: string;
  agent?: AdminMini | null;
  createdAt?: string;
  updatedAt?: string;
  report?: VisitReportDetail | null;
}

export interface VisitReportMedia {
  id?: number;
  mediaType?: string;
  mediaUrl?: string;
  caption?: string;
  altText?: string;
  takenAt?: string;
  sortOrder?: number;
  isPropertyMedia?: boolean;
  isMain?: boolean;
}

export interface VisitReportGeoPhoto {
  id?: number;
  mediaUrl?: string;
  caption?: string;
  altText?: string;
  takenAt?: string;
  gps?: string;
}

export interface VisitReportProperty {
  id?: string;
  title?: string;
  propertyType?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  area?: number;
  areaUnit?: string;
  khasraNumber?: string;
}

export interface VisitReportOwner {
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface VisitReportItem {
  id: string;
  fieldVisitId: number;
  agentId?: string;
  conditionRating?: number;
  observations?: string;
  issuesFound?: unknown;
  recommendations?: string;
  recommendedAddons?: unknown;
  checklistResponses?: unknown;
  aiReport?: unknown;
  localAreaMapUrl?: string;
  status?: VisitReportStatus;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  reviewedBy?: AdminMini | null;
  sectionReviews?: unknown;
  resubmissionCount?: number;
  reviewSections?: unknown;
  createdAt?: string;
  updatedAt?: string;
  agent?: AdminMini | null;
  fieldVisit?: FieldVisit | null;
  property?: VisitReportProperty | null;
  owner?: VisitReportOwner | null;
  media?: VisitReportMedia[] | null;
  caseNumber?: string;
  legalCheckSummary?: string;
  legalDisclaimer?: string;
  geoTaggedPhotos?: VisitReportGeoPhoto[] | null;
  checklistDetails?: unknown;
  giReportPrefill?: unknown;
}

export interface VisitReportListResult {
  meta: VisitRequestMeta;
  rows: VisitReportItem[];
}

export interface VisitRequest {
  id: string;
  visitRequestStatus?: VisitRequestStatus;
  visitCategory?: string;
  description?: string;
  preferredDate?: string;
  preferredTimeSlot?: string;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
  agentAssignedAt?: string;
  requestedBy?: TwoBighaUserMini | null;
  owner?: TwoBighaUserMini | null;
  property?: VisitRequestProperty | null;
  assignedAgent?: unknown;
}

export interface VisitRequestStatusCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  closed: number;
  scheduled: number;
}

export interface VisitRequestListResult {
  meta: VisitRequestMeta;
  stats?: VisitRequestStatusCounts | null;
  rows: VisitRequest[];
}

export interface TwoBighaVisitRead<T> {
  configured: boolean;
  data: T | null;
}

export interface VisitContextPayload {
  twobighaUserId: string | null;
  reason?: "no_client" | "not_synced";
  visits: FieldVisitListResult | null;
  requests: VisitRequestListResult | null;
}

export type VisitListParams = {
  page?: number;
  limit?: number;
};

export type AllFieldVisitsParams = VisitListParams & {
  status?: string;
  agentId?: string;
  userPropertyId?: string;
  visitCategory?: string;
  startDate?: string;
  endDate?: string;
};

export type AllVisitRequestsParams = VisitListParams & {
  subscriptionStatus?: string;
  status?: string;
  purpose?: string;
  propertyId?: string;
  searchTerm?: string;
  managerId?: string;
  agentId?: string;
  userId?: string;
};

function toQuery(params: Record<string, string | number | undefined>) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}

export async function fetchVisitContextForLead(
  leadId: string,
  params: VisitListParams = {},
): Promise<TwoBighaVisitRead<VisitContextPayload>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitContextPayload>>(
    `/crm/visits/context/lead/${encodeURIComponent(leadId)}`,
    { params: toQuery({ page: params.page, limit: params.limit }) },
  );
  return data;
}

export async function fetchVisitContextForClient(
  clientId: string,
  params: VisitListParams = {},
): Promise<TwoBighaVisitRead<VisitContextPayload>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitContextPayload>>(
    `/crm/visits/context/client/${encodeURIComponent(clientId)}`,
    { params: toQuery({ page: params.page, limit: params.limit }) },
  );
  return data;
}

export async function fetchAllFieldVisits(
  params: AllFieldVisitsParams = {},
): Promise<TwoBighaVisitRead<FieldVisitListResult>> {
  const { data } = await api.get<TwoBighaVisitRead<FieldVisitListResult>>("/crm/visits/field-visits", {
    params: toQuery(params),
  });
  return data;
}

export async function fetchFieldVisitsByUser(
  userId: string,
  params: VisitListParams = {},
): Promise<TwoBighaVisitRead<FieldVisitListResult>> {
  const { data } = await api.get<TwoBighaVisitRead<FieldVisitListResult>>(
    `/crm/visits/field-visits/by-user/${encodeURIComponent(userId)}`,
    { params: toQuery({ page: params.page, limit: params.limit }) },
  );
  return data;
}

export async function fetchFieldVisitsByProperty(
  managePropertyId: string,
  params: VisitListParams = {},
): Promise<TwoBighaVisitRead<FieldVisitListResult>> {
  const { data } = await api.get<TwoBighaVisitRead<FieldVisitListResult>>(
    `/crm/visits/field-visits/by-property/${encodeURIComponent(managePropertyId)}`,
    { params: toQuery({ page: params.page, limit: params.limit }) },
  );
  return data;
}

export async function fetchFieldVisitDetailed(
  fieldVisitId: string | number,
): Promise<TwoBighaVisitRead<FieldVisitDetailed>> {
  const { data } = await api.get<TwoBighaVisitRead<FieldVisitDetailed>>(
    `/crm/visits/field-visits/${encodeURIComponent(String(fieldVisitId))}`,
  );
  return data;
}

export async function fetchVisitReports(params: {
  userPropertyId?: string;
  reportStatus?: string;
  purpose?: string;
} = {}): Promise<TwoBighaVisitRead<VisitReport[]>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitReport[]>>("/crm/visits/reports", {
    params: toQuery(params),
  });
  return data;
}

export async function fetchVisitReportsByProperty(
  propertyId: string,
  params: VisitListParams = {},
): Promise<TwoBighaVisitRead<VisitReportListResult>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitReportListResult>>(
    `/crm/visits/reports/by-property/${encodeURIComponent(propertyId)}`,
    { params: toQuery({ page: params.page, limit: params.limit }) },
  );
  return data;
}

export async function fetchVisitReportDetails(
  reportId: string | number,
): Promise<TwoBighaVisitRead<VisitReportItem>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitReportItem>>(
    `/crm/visits/reports/${encodeURIComponent(String(reportId))}`,
  );
  return data;
}

export async function fetchAllVisitRequests(
  params: AllVisitRequestsParams = {},
): Promise<TwoBighaVisitRead<VisitRequestListResult>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitRequestListResult>>("/crm/visits/requests", {
    params: toQuery(params),
  });
  return data;
}

export async function fetchVisitRequestsByProperty(
  managePropertyId: string,
  params: VisitListParams = {},
): Promise<TwoBighaVisitRead<VisitRequestListResult>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitRequestListResult>>(
    `/crm/visits/requests/by-property/${encodeURIComponent(managePropertyId)}`,
    { params: toQuery({ page: params.page, limit: params.limit }) },
  );
  return data;
}

export async function fetchVisitRequestById(
  visitRequestId: string,
): Promise<TwoBighaVisitRead<VisitRequest>> {
  const { data } = await api.get<TwoBighaVisitRead<VisitRequest>>(
    `/crm/visits/requests/${encodeURIComponent(visitRequestId)}`,
  );
  return data;
}
