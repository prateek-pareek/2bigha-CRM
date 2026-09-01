import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';
import { isMongoObjectIdString } from '../shared/crm-record-id.util';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { Client, ClientDocument } from '../records/schemas/client.schema';

/**
 * 2bigha Visit Tracking & History — handbook §4 (pm-visits.types.ts).
 *
 * Read-through only. The CRM calling-agent use cases are:
 *  - “Has anyone actually come out?” → getFieldVisitByUserId
 *  - “I asked for a visit three days ago” → getAllVisitRequests(userId)
 *  - Drill into one visit / report / request by id
 *
 * stats on FieldVisitListResult is documented as null for per-user / per-property
 * list queries — only getAllFieldVisits is expected to populate it.
 */

const USERDATA_FIELDS = `
  userId
  firstName
  lastName
  phone
  email
  role
`;

const ADMIN_MINI_FIELDS = `
  adminId
  firstName
  lastName
  email
  phone
`;

/** Skip location/boundary/geoJson — free-form JSON the handbook flags as unsafe to fetch by default. */
const VISIT_REQUEST_PROPERTY_FIELDS = `
  propertyId
  title
  propertyName
  description
  propertyType
  status
  price
  area
  areaUnit
  khasraNumber
  address
  city
  district
  state
  country
  pinCode
  latLng
`;

const FIELD_VISIT_REPORT_SUMMARY_FIELDS = `
  reportId
  status
  submittedAt
  reviewedAt
`;

const FIELD_VISIT_AGENT_ASSIGNED_FIELDS = `
  adminId
  firstName
  lastName
  email
  phone
`;

const FIELD_VISIT_FIELDS = `
  id
  visitRequestId
  userPropertyId
  agentId
  visitCategory
  status
  countsTowardLimit
  scheduledAt
  checkInAt
  checkInLat
  checkInLng
  checkOutAt
  checkOutLat
  checkOutLng
  durationMinutes
  notes
  locationMatchCheck
  propertyAccessible
  createdAt
  updatedAt
  owner {
    ${USERDATA_FIELDS}
  }
  property {
    ${VISIT_REQUEST_PROPERTY_FIELDS}
  }
  report {
    ${FIELD_VISIT_REPORT_SUMMARY_FIELDS}
  }
  agentAssigned {
    ${FIELD_VISIT_AGENT_ASSIGNED_FIELDS}
  }
`;

const VISIT_REQUEST_META_FIELDS = `
  page
  limit
  total
  totalPages
`;

const FIELD_VISIT_STATUS_COUNTS_FIELDS = `
  total
  scheduled
  agentOnWay
  inProgress
  completed
  missed
  cancelled
`;

const FIELD_VISIT_LIST_RESULT_FIELDS = `
  meta {
    ${VISIT_REQUEST_META_FIELDS}
  }
  stats {
    ${FIELD_VISIT_STATUS_COUNTS_FIELDS}
  }
  rows {
    ${FIELD_VISIT_FIELDS}
  }
`;

const VISIT_REQUEST_FIELDS = `
  id
  visitRequestStatus
  visitCategory
  description
  preferredDate
  preferredTimeSlot
  statusReason
  createdAt
  updatedAt
  agentAssignedAt
  requestedBy {
    ${USERDATA_FIELDS}
  }
  owner {
    ${USERDATA_FIELDS}
  }
  property {
    ${VISIT_REQUEST_PROPERTY_FIELDS}
  }
  assignedAgent
`;

const VISIT_REQUEST_STATUS_COUNTS_FIELDS = `
  total
  pending
  approved
  rejected
  closed
  scheduled
`;

const VISIT_REQUEST_LIST_RESULT_FIELDS = `
  meta {
    ${VISIT_REQUEST_META_FIELDS}
  }
  stats {
    ${VISIT_REQUEST_STATUS_COUNTS_FIELDS}
  }
  rows {
    ${VISIT_REQUEST_FIELDS}
  }
`;

const VISIT_REPORT_DETAIL_FIELDS = `
  reportId
  conditionRating
  observations
  issuesFound
  recommendations
  checklistResponses
  reportStatus
  submittedAt
  reviewedAt
  rejectionReason
  reviewedBy {
    ${ADMIN_MINI_FIELDS}
  }
  aiReport
  sectionReviews
  resubmissionCount
`;

const VISIT_REPORT_FIELDS = `
  visitId
  scheduledAt
  checkInAt
  checkOutAt
  durationMinutes
  visitCategory
  fieldVisitStatus
  notes
  agent {
    ${ADMIN_MINI_FIELDS}
  }
  createdAt
  updatedAt
  report {
    ${VISIT_REPORT_DETAIL_FIELDS}
  }
`;

const VISIT_REPORT_ITEM_FIELDS = `
  id
  fieldVisitId
  agentId
  conditionRating
  observations
  issuesFound
  recommendations
  recommendedAddons
  checklistResponses
  aiReport
  localAreaMapUrl
  status
  submittedAt
  reviewedAt
  rejectionReason
  sectionReviews
  resubmissionCount
  reviewSections
  createdAt
  updatedAt
  agent {
    ${ADMIN_MINI_FIELDS}
  }
  fieldVisit {
    ${FIELD_VISIT_FIELDS}
  }
  property {
    id
    title
    propertyType
    address
    city
    district
    state
    area
    areaUnit
    khasraNumber
  }
  owner {
    userId
    firstName
    lastName
    email
  }
  media {
    id
    mediaType
    mediaUrl
    caption
    altText
    takenAt
    sortOrder
    isPropertyMedia
    isMain
  }
  caseNumber
  legalCheckSummary
  legalDisclaimer
  geoTaggedPhotos {
    id
    mediaUrl
    caption
    altText
    takenAt
    gps
  }
  checklistDetails
  giReportPrefill
`;

const GET_FIELD_VISIT_BY_USER_ID = `
  query GetFieldVisitByUserId($userId: String!, $page: Int, $limit: Int) {
    getFieldVisitByUserId(userId: $userId, page: $page, limit: $limit) {
      ${FIELD_VISIT_LIST_RESULT_FIELDS}
    }
  }
`;

const GET_FIELD_VISIT_BY_PROPERTY_ID = `
  query GetFieldVisitByPropertyId($managePropertyId: String!, $page: Int, $limit: Int) {
    getFieldVisitByPropertyId(managePropertyId: $managePropertyId, page: $page, limit: $limit) {
      ${FIELD_VISIT_LIST_RESULT_FIELDS}
    }
  }
`;

const GET_ALL_FIELD_VISITS = `
  query GetAllFieldVisits(
    $page: Int
    $limit: Int
    $status: String
    $agentId: String
    $userPropertyId: String
    $visitCategory: String
    $startDate: Date
    $endDate: Date
  ) {
    getAllFieldVisits(
      page: $page
      limit: $limit
      status: $status
      agentId: $agentId
      userPropertyId: $userPropertyId
      visitCategory: $visitCategory
      startDate: $startDate
      endDate: $endDate
    ) {
      ${FIELD_VISIT_LIST_RESULT_FIELDS}
    }
  }
`;

const GET_FIELD_VISITS_DETAILED = `
  query GetFieldVisitsDetailed($fieldVisitId: Int!) {
    getFieldVisitsDetailed(fieldVisitId: $fieldVisitId) {
      fieldVisit {
        ${FIELD_VISIT_FIELDS}
      }
      agent {
        ${ADMIN_MINI_FIELDS}
      }
      property
      owner {
        ${USERDATA_FIELDS}
      }
      manager {
        ${ADMIN_MINI_FIELDS}
      }
      request
      report
    }
  }
`;

const GET_VISIT_REPORTS = `
  query GetVisitReports($userPropertyId: String, $reportStatus: VisitReportStatus, $purpose: String) {
    getVisitReports(userPropertyId: $userPropertyId, reportStatus: $reportStatus, purpose: $purpose) {
      ${VISIT_REPORT_FIELDS}
    }
  }
`;

const GET_ALL_VISIT_REPORTS_BY_PROPERTY_ID = `
  query GetAllVisitReportsByPropertyId($propertyId: String!, $page: Int, $limit: Int) {
    getAllVisitReportsByPropertyId(propertyId: $propertyId, page: $page, limit: $limit) {
      meta {
        ${VISIT_REQUEST_META_FIELDS}
      }
      rows {
        ${VISIT_REPORT_ITEM_FIELDS}
      }
    }
  }
`;

const GET_VISIT_REPORT_DETAILS_BY_REPORT_ID = `
  query GetVisitReportDetailsByReportId($reportId: Int!) {
    getVisitReportDetailsByReportId(reportId: $reportId) {
      ${VISIT_REPORT_ITEM_FIELDS}
    }
  }
`;

const GET_ALL_VISIT_REQUESTS = `
  query GetAllVisitRequests(
    $page: Int
    $limit: Int
    $subscriptionStatus: String
    $status: String
    $purpose: String
    $propertyId: String
    $searchTerm: String
    $managerId: String
    $agentId: String
    $userId: String
  ) {
    getAllVisitRequests(
      page: $page
      limit: $limit
      subscriptionStatus: $subscriptionStatus
      status: $status
      purpose: $purpose
      propertyId: $propertyId
      searchTerm: $searchTerm
      managerId: $managerId
      agentId: $agentId
      userId: $userId
    ) {
      ${VISIT_REQUEST_LIST_RESULT_FIELDS}
    }
  }
`;

const GET_VISIT_REQUEST_BY_ID = `
  query GetVisitRequestById($visitRequestId: String!) {
    getVisitRequestById(visitRequestId: $visitRequestId) {
      ${VISIT_REQUEST_FIELDS}
    }
  }
`;

const GET_VISIT_REQUEST_BY_PROPERTY_ID = `
  query GetVisitRequestByPropertyId($managePropertyId: String!, $page: Int, $limit: Int) {
    getVisitRequestByPropertyId(managePropertyId: $managePropertyId, page: $page, limit: $limit) {
      ${VISIT_REQUEST_LIST_RESULT_FIELDS}
    }
  }
`;

export type TwoBighaVisitRead<T> = {
  /** False when TWOBIGHA_USE_MOCK or credentials are missing — callers must not treat this as an empty list. */
  configured: boolean;
  data: T | null;
};

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

export type VisitReportsParams = {
  userPropertyId?: string;
  reportStatus?: string;
  purpose?: string;
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

export type VisitContextResult = TwoBighaVisitRead<{
  twobighaUserId: string | null;
  reason?: 'no_client' | 'not_synced';
  visits: Record<string, unknown> | null;
  requests: Record<string, unknown> | null;
}>;

function compactVars(vars: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(vars).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

@Injectable()
export class TwoBighaVisitsService {
  private readonly logger = new Logger(TwoBighaVisitsService.name);

  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private readonly clientModel: Model<ClientDocument>,
  ) {}

  private async queryField<T>(
    query: string,
    variables: Record<string, unknown>,
    field: string,
  ): Promise<TwoBighaVisitRead<T>> {
    const config = getTwoBighaConfig();
    if (!config) return { configured: false, data: null };

    try {
      const data = await twoBighaGraphqlRequest<Record<string, T | null>>(
        config,
        query,
        compactVars(variables),
      );
      return { configured: true, data: (data?.[field] ?? null) as T | null };
    } catch (e: any) {
      this.logger.error(`2bigha ${field} failed: ${e?.message}`);
      throw e;
    }
  }

  getFieldVisitByUserId(userId: string, params: VisitListParams = {}) {
    return this.queryField(GET_FIELD_VISIT_BY_USER_ID, {
      userId,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }, 'getFieldVisitByUserId');
  }

  getFieldVisitByPropertyId(managePropertyId: string, params: VisitListParams = {}) {
    return this.queryField(GET_FIELD_VISIT_BY_PROPERTY_ID, {
      managePropertyId,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }, 'getFieldVisitByPropertyId');
  }

  getAllFieldVisits(params: AllFieldVisitsParams = {}) {
    return this.queryField(GET_ALL_FIELD_VISITS, {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      status: params.status,
      agentId: params.agentId,
      userPropertyId: params.userPropertyId,
      visitCategory: params.visitCategory,
      startDate: params.startDate,
      endDate: params.endDate,
    }, 'getAllFieldVisits');
  }

  getFieldVisitsDetailed(fieldVisitId: number) {
    return this.queryField(GET_FIELD_VISITS_DETAILED, { fieldVisitId }, 'getFieldVisitsDetailed');
  }

  getVisitReports(params: VisitReportsParams = {}) {
    return this.queryField(GET_VISIT_REPORTS, {
      userPropertyId: params.userPropertyId,
      reportStatus: params.reportStatus,
      purpose: params.purpose,
    }, 'getVisitReports');
  }

  getAllVisitReportsByPropertyId(propertyId: string, params: VisitListParams = {}) {
    return this.queryField(GET_ALL_VISIT_REPORTS_BY_PROPERTY_ID, {
      propertyId,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }, 'getAllVisitReportsByPropertyId');
  }

  getVisitReportDetailsByReportId(reportId: number) {
    return this.queryField(
      GET_VISIT_REPORT_DETAILS_BY_REPORT_ID,
      { reportId },
      'getVisitReportDetailsByReportId',
    );
  }

  getAllVisitRequests(params: AllVisitRequestsParams = {}) {
    return this.queryField(GET_ALL_VISIT_REQUESTS, {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      subscriptionStatus: params.subscriptionStatus,
      status: params.status,
      purpose: params.purpose,
      propertyId: params.propertyId,
      searchTerm: params.searchTerm,
      managerId: params.managerId,
      agentId: params.agentId,
      userId: params.userId,
    }, 'getAllVisitRequests');
  }

  /**
   * 2bigha `getVisitRequestById` currently returns null for valid ids that
   * still appear in `getAllVisitRequests` (confirmed on staging, e.g. id 91).
   * Fall back to the list so CRM request detail pages stay usable.
   */
  async getVisitRequestById(visitRequestId: string) {
    const byId = await this.queryField(GET_VISIT_REQUEST_BY_ID, { visitRequestId }, 'getVisitRequestById');
    if (!byId.configured || byId.data) return byId;

    try {
      const fallback = await this.findVisitRequestInAll(visitRequestId);
      if (fallback) {
        this.logger.warn(
          `2bigha getVisitRequestById(${visitRequestId}) returned null; resolved via getAllVisitRequests`,
        );
        return { configured: true, data: fallback };
      }
    } catch (e: any) {
      this.logger.error(`visit request list fallback failed: ${e?.message}`);
    }

    return byId;
  }

  private async findVisitRequestInAll(visitRequestId: string) {
    const id = String(visitRequestId).trim();
    if (!id) return null;

    const pageSize = 100;
    let page = 1;
    let totalPages = 1;

    do {
      const listed = await this.getAllVisitRequests({ page, limit: pageSize });
      if (!listed.configured) return null;
      const rows = (listed.data as { rows?: Array<{ id?: string | number }> } | null)?.rows ?? [];
      const found = rows.find((row) => String(row?.id) === id);
      if (found) return found;
      totalPages = Number((listed.data as { meta?: { totalPages?: number } } | null)?.meta?.totalPages) || 1;
      page += 1;
    } while (page <= totalPages && page <= 20);

    return null;
  }

  getVisitRequestByPropertyId(managePropertyId: string, params: VisitListParams = {}) {
    return this.queryField(GET_VISIT_REQUEST_BY_PROPERTY_ID, {
      managePropertyId,
      page: params.page ?? 1,
      limit: params.limit ?? 20,
    }, 'getVisitRequestByPropertyId');
  }

  /**
   * Lead-detail entry point: resolve Client.twobighaUserId, then load that
   * user's field visits + visit requests in one CRM round trip.
   */
  async getContextForLead(
    leadId: string,
    params: VisitListParams = {},
  ): Promise<VisitContextResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { configured: false, data: null };
    }

    const lead = await this.findLead(leadId);
    const clientId = (lead as any)?.clientId;
    if (!clientId) {
      return {
        configured: true,
        data: { twobighaUserId: null, reason: 'no_client', visits: null, requests: null },
      };
    }

    return this.getContextForClient(String(clientId), params);
  }

  async getContextForClient(
    clientId: string,
    params: VisitListParams = {},
  ): Promise<VisitContextResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { configured: false, data: null };
    }

    const client = isMongoObjectIdString(clientId)
      ? await this.clientModel.findById(clientId).select('twobighaUserId').lean().exec()
      : null;
    const twobighaUserId = (client as any)?.twobighaUserId?.trim() || null;
    if (!twobighaUserId) {
      return {
        configured: true,
        data: { twobighaUserId: null, reason: 'not_synced', visits: null, requests: null },
      };
    }

    const [visitsResult, requestsResult] = await Promise.allSettled([
      this.getFieldVisitByUserId(twobighaUserId, params),
      this.getAllVisitRequests({ ...params, userId: twobighaUserId }),
    ]);

    if (visitsResult.status === 'rejected') {
      this.logger.error(`getFieldVisitByUserId failed: ${visitsResult.reason?.message || visitsResult.reason}`);
    }
    if (requestsResult.status === 'rejected') {
      this.logger.error(`getAllVisitRequests failed: ${requestsResult.reason?.message || requestsResult.reason}`);
    }

    return {
      configured: true,
      data: {
        twobighaUserId,
        visits:
          visitsResult.status === 'fulfilled'
            ? ((visitsResult.value.data as Record<string, unknown> | null) ?? null)
            : null,
        requests:
          requestsResult.status === 'fulfilled'
            ? ((requestsResult.value.data as Record<string, unknown> | null) ?? null)
            : null,
      },
    };
  }

  private async findLead(leadId: string): Promise<LeadDocument | { clientId?: unknown } | null> {
    if (isMongoObjectIdString(leadId)) {
      return this.leadModel.findById(leadId).select('clientId').lean().exec();
    }
    return this.leadModel.findOne({ recordId: leadId }).select('clientId').lean().exec();
  }
}
