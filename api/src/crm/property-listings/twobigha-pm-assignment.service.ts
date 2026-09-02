import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

/**
 * 2bigha PM assignment GraphQL — handbook §5 inventory + process-flow
 * RM → Legal Manager → Field Agent. Mutations take a managed
 * `userPropertyId` (not a marketplace property id).
 *
 * Staff lists:
 *  - getAllFieldAgentManagers  (Regional Managers)
 *  - getAllLegalManagers
 *  - getAllFieldAgents
 *
 * Do not select `properties` on the staff items — 2bigha's SDL types that
 * field as an anonymous non-null list and requesting it fails validation.
 */

export type PmAssignRole = 'manager' | 'legal' | 'field';

export interface TwoBighaPmStaffItem {
  adminId: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  department?: string;
  employeeId?: string;
  totalProperties?: number;
}

export interface TwoBighaPmStaffList {
  role: PmAssignRole;
  items: TwoBighaPmStaffItem[];
  total: number;
  mock: boolean;
}

export interface PmWorkflowResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface TwoBighaManagedPropertyListParams {
  page?: number;
  limit?: number;
  searchTerm?: string;
  planName?: string;
  pmStage?: string;
}

export interface TwoBighaManagedListing {
  _id: string;
  listingBucket: 'pm';
  title: string;
  address?: string;
  city?: string;
  state?: string;
  district?: string;
  country?: string;
  zipCode?: string;
  price: number;
  currency: string;
  propertyType: string;
  listedFor: 'Sale';
  areaValue?: number;
  areaUnit?: string;
  status: string;
  approvalStatus: string;
  verified: boolean;
  description?: string;
  images: string[];
  amenities: string[];
  khasraNumber?: string;
  googleMapsLink?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  twobighaPropertyId?: string;
  userPropertyId?: string;
  pmPlan?: string;
  pmStage: string;
  rmAssigneeId?: string;
  rmAssigneeName?: string;
  legalAssigneeId?: string;
  legalAssigneeName?: string;
  fieldAssigneeId?: string;
  fieldAssigneeName?: string;
  pmAssignmentSyncStatus?: string;
  pmAssignmentSyncError?: string;
  listedDate?: string;
  createdAt: string;
  updatedAt: string;
}

const STAFF_ITEM_FIELDS = `
  adminId
  firstName
  lastName
  email
  phone
  department
  employeeId
  totalProperties
`;

const GET_MANAGERS = `
  query GetAllFieldAgentManagers($page: Int, $limit: Int, $searchTerm: String) {
    getAllFieldAgentManagers(page: $page, limit: $limit, searchTerm: $searchTerm) {
      meta { page limit total totalPages }
      data { ${STAFF_ITEM_FIELDS} }
    }
  }
`;

const GET_LEGAL = `
  query GetAllLegalManagers($page: Int, $limit: Int, $searchTerm: String) {
    getAllLegalManagers(page: $page, limit: $limit, searchTerm: $searchTerm) {
      meta { page limit total totalPages }
      data { ${STAFF_ITEM_FIELDS} }
    }
  }
`;

const GET_FIELD = `
  query GetAllFieldAgents($page: Int, $limit: Int, $searchTerm: String) {
    getAllFieldAgents(page: $page, limit: $limit, searchTerm: $searchTerm) {
      meta { page limit total totalPages }
      data { ${STAFF_ITEM_FIELDS} }
    }
  }
`;

const ADMIN_MINI_FIELDS = `
  adminId
  firstName
  lastName
  email
  phone
`;

const MANAGED_ITEM_FIELDS = `
  userPropertyId
  subscriptionStatus
  assignmentStatus
  visitsIncluded
  visitsRemaining
  visitsUsed
  legalCheckStatus
  user { userId firstName lastName phone email }
  planDetails { planId planName billingCycle durationDays visitsAllowed price }
  assignedManager { ${ADMIN_MINI_FIELDS} }
  assignedAgent { ${ADMIN_MINI_FIELDS} }
  assignedLegalManager { ${ADMIN_MINI_FIELDS} }
  images { imageUrl isMain }
  property {
    id
    title
    propertyName
    propertyType
    description
    khasraNumber
    address
    city
    district
    state
    country
    pinCode
    area
    areaUnit
    googleMapsLink
    createdAt
    updatedAt
  }
`;

const GET_MANAGED_BY_ROLE = `
  query GetAllManagedPropertiesByRole(
    $page: Int
    $limit: Int
    $searchTerm: String
    $planName: String
  ) {
    getAllManagedPropertiesByRole(
      page: $page
      limit: $limit
      searchTerm: $searchTerm
      planName: $planName
    ) {
      meta { page limit total totalPages }
      data {
        ${MANAGED_ITEM_FIELDS}
        recentVisit { visitId status reportStatus visitDate }
      }
    }
  }
`;

const GET_MANAGED_DETAIL = `
  query GetManagedPropertyDetail($propertyId: String, $userPropertyId: String) {
    getManagedPropertyDetail(propertyId: $propertyId, userPropertyId: $userPropertyId) {
      ${MANAGED_ITEM_FIELDS}
    }
  }
`;

type AdminMini = {
  adminId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

type ManagedPropertyItem = {
  userPropertyId?: string | null;
  subscriptionStatus?: string | null;
  assignmentStatus?: string | null;
  legalCheckStatus?: string | null;
  user?: {
    userId?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
  } | null;
  planDetails?: { planName?: string } | null;
  assignedManager?: AdminMini | null;
  assignedAgent?: AdminMini | null;
  assignedLegalManager?: AdminMini | null;
  recentVisit?: { status?: string; reportStatus?: string } | null;
  images?: Array<{ imageUrl?: string; isMain?: boolean }> | null;
  property?: {
    id?: string;
    title?: string;
    propertyName?: string;
    propertyType?: string;
    description?: string;
    khasraNumber?: string;
    address?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    pinCode?: string;
    area?: number;
    areaUnit?: string;
    googleMapsLink?: string;
    createdAt?: string;
    updatedAt?: string;
  } | null;
};

const PROPERTY_TYPE_REVERSE: Record<string, string> = {
  APARTMENT: 'Apartment',
  VILLA: 'Villa',
  RESIDENTIAL: 'Residential',
  PLOT: 'Plot',
  COMMERCIAL: 'Commercial',
  OFFICE: 'Office',
  WAREHOUSE: 'Warehouse',
  FARM: 'Farm',
  AGRICULTURAL: 'Agricultural',
  INDUSTRIAL: 'Industrial',
  FARMHOUSE: 'Farmhouse',
  FARMLAND: 'Farmland',
};

const AREA_UNIT_REVERSE: Record<string, string> = {
  SQYRD: 'Sq. Yard',
  SQFT: 'Sq. Ft',
  SQUARE_FEET: 'Sq. Ft',
  SQM: 'Sq. M',
  ACRE: 'Acre',
  HECTARE: 'Hectare',
  BIGHA: 'Bigha',
  BIGHAS: 'Bigha',
  KATHA: 'Katha',
  MARLA: 'Marla',
  KANAL: 'Kanal',
  GUNTA: 'Guntha',
  CENT: 'Cent',
  NALI: 'Nali',
};

function adminName(admin?: AdminMini | null): string | undefined {
  if (!admin) return undefined;
  const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim();
  return name || admin.email || admin.adminId || undefined;
}

export function livePmListingId(item: {
  userPropertyId?: string | null;
  property?: { id?: string } | null;
}): string {
  if (item.userPropertyId) return `pm_${item.userPropertyId}`;
  if (item.property?.id) return `pm_prop_${item.property.id}`;
  return `pm_unknown`;
}

export function parseLivePmListingId(id: string): {
  userPropertyId?: string;
  propertyId?: string;
} {
  if (id.startsWith('pm_prop_')) return { propertyId: id.slice('pm_prop_'.length) };
  if (id.startsWith('pm_')) return { userPropertyId: id.slice(3) };
  return { userPropertyId: id };
}

export function assignmentStatusToPmStage(
  status?: string | null,
  item?: ManagedPropertyItem,
): string {
  const report = String(item?.recentVisit?.reportStatus || '').toUpperCase();
  if (report === 'APPROVED') return 'Visit Report Approved';
  if (report === 'REJECTED') return 'Visit Report Rejected';
  if (report === 'PENDING' || report === 'CHANGES_REQUESTED' || report === 'SUBMITTED') {
    return 'Visit Report Pending';
  }

  switch (String(status || '').toUpperCase()) {
    case 'MANAGER_ASSIGNED':
    case 'ASSIGNED':
      return 'Assigned to RM';
    case 'LEGAL_MANAGER_ASSIGNED':
    case 'LEGAL_VERIFICATION_PENDING':
    case 'DOCUMENT_VERIFICATION':
    case 'LEGAL_VERIFICATION_COMPLETED':
      return 'Assigned to Legal';
    case 'AGENT_ASSIGNED':
    case 'PRE_VERIFICATION_PENDING':
    case 'IN_PROGRESS':
      return 'Assigned to Field Agent';
    case 'PRE_VERIFICATION_COMPLETED':
    case 'FINAL_VERIFICATION_COMPLETED':
      return 'Visit Report Pending';
    case 'APPROVED':
      return 'Visit Report Approved';
    case 'REJECTED':
      return 'Visit Report Rejected';
    case 'UNASSIGNED':
      return 'Property Submitted';
    default:
      break;
  }

  if (item?.assignedAgent?.adminId) return 'Assigned to Field Agent';
  if (item?.assignedLegalManager?.adminId) return 'Assigned to Legal';
  if (item?.assignedManager?.adminId) return 'Assigned to RM';
  return 'Property Submitted';
}

export function mapManagedItemToListing(item: ManagedPropertyItem): TwoBighaManagedListing {
  const p = item.property || {};
  const now = new Date().toISOString();
  const userName = [item.user?.firstName, item.user?.lastName].filter(Boolean).join(' ').trim();
  const images = [...(item.images || [])]
    .sort((a, b) => Number(Boolean(b.isMain)) - Number(Boolean(a.isMain)))
    .map((img) => img.imageUrl)
    .filter((url): url is string => Boolean(url));
  const typeKey = String(p.propertyType || '').toUpperCase();
  const unitKey = String(p.areaUnit || '').toUpperCase();
  const area = typeof p.area === 'number' && Number.isFinite(p.area) && p.area > 0 ? p.area : undefined;

  return {
    _id: livePmListingId(item),
    listingBucket: 'pm',
    title: p.title || p.propertyName || 'Untitled PM property',
    address: p.address || undefined,
    city: p.city || undefined,
    state: p.state || undefined,
    district: p.district || undefined,
    country: p.country || 'India',
    zipCode: p.pinCode || undefined,
    price: 0,
    currency: 'INR',
    propertyType: PROPERTY_TYPE_REVERSE[typeKey] || p.propertyType || 'Other',
    listedFor: 'Sale',
    areaValue: area,
    areaUnit: AREA_UNIT_REVERSE[unitKey] || p.areaUnit || undefined,
    status: 'Managed',
    approvalStatus: 'Approved',
    verified: Boolean(item.userPropertyId),
    description: p.description || undefined,
    images,
    amenities: [],
    khasraNumber: p.khasraNumber || undefined,
    googleMapsLink: p.googleMapsLink || undefined,
    contactName: userName || undefined,
    contactPhone: item.user?.phone || undefined,
    contactEmail: item.user?.email || undefined,
    twobighaPropertyId: p.id || undefined,
    userPropertyId: item.userPropertyId || undefined,
    pmPlan: item.planDetails?.planName || undefined,
    pmStage: assignmentStatusToPmStage(item.assignmentStatus, item),
    rmAssigneeId: item.assignedManager?.adminId || undefined,
    rmAssigneeName: adminName(item.assignedManager),
    legalAssigneeId: item.assignedLegalManager?.adminId || undefined,
    legalAssigneeName: adminName(item.assignedLegalManager),
    fieldAssigneeId: item.assignedAgent?.adminId || undefined,
    fieldAssigneeName: adminName(item.assignedAgent),
    listedDate: p.createdAt || now,
    createdAt: p.createdAt || now,
    updatedAt: p.updatedAt || now,
  };
}

const ASSIGN_MANAGER = `
  mutation AssignPropertyToManager($input: AssignPropertyToManagerInput!) {
    assignPropertyToManager(input: $input) { success message data }
  }
`;
const REASSIGN_MANAGER = `
  mutation ReAssignPropertyToManager($input: ReAssignPropertyToManagerInput!) {
    reAssignPropertyToManager(input: $input) { success message data }
  }
`;
const UNASSIGN_MANAGER = `
  mutation UnAssignPropertyToManager($input: UnAssignPropertyToManagerInput!) {
    unAssignPropertyToManager(input: $input) { success message data }
  }
`;

const ASSIGN_LEGAL = `
  mutation AssignPropertyToLegalManager($input: AssignPropertyToLegalManagerInput!) {
    assignPropertyToLegalManager(input: $input) { success message data }
  }
`;
const REASSIGN_LEGAL = `
  mutation ReAssignPropertyToLegalManager($input: ReAssignPropertyToLegalManagerInput!) {
    reAssignPropertyToLegalManager(input: $input) { success message data }
  }
`;
const UNASSIGN_LEGAL = `
  mutation UnAssignPropertyToLegalManager($input: UnAssignPropertyToLegalManagerInput!) {
    unAssignPropertyToLegalManager(input: $input) { success message data }
  }
`;

const ASSIGN_FIELD = `
  mutation AssignPropertyToFieldAgent($input: AssignPropertyToFieldAgentInput!) {
    assignPropertyToFieldAgent(input: $input) { success message data }
  }
`;
const REASSIGN_FIELD = `
  mutation ReAssignPropertyToFieldAgent($input: ReAssignPropertyToFieldAgentInput!) {
    reAssignPropertyToFieldAgent(input: $input) { success message data }
  }
`;
const UNASSIGN_FIELD = `
  mutation UnAssignPropertyToFieldAgent($input: UnAssignPropertyToFieldAgentInput!) {
    unAssignPropertyToFieldAgent(input: $input) { success message data }
  }
`;

type ListEnvelope = {
  meta?: { page?: number; limit?: number; total?: number; totalPages?: number };
  data?: TwoBighaPmStaffItem[];
};

function mockStaff(role: PmAssignRole): TwoBighaPmStaffList {
  const base: TwoBighaPmStaffItem[] =
    role === 'manager'
      ? [
          { adminId: 'mock-rm-1', firstName: 'Asha', lastName: 'Mehta', email: 'asha.rm@mock.2bigha', department: 'PM' },
          { adminId: 'mock-rm-2', firstName: 'Ravi', lastName: 'Sharma', email: 'ravi.rm@mock.2bigha', department: 'PM' },
        ]
      : role === 'legal'
        ? [
            { adminId: 'mock-legal-1', firstName: 'Priya', lastName: 'Desai', email: 'priya.legal@mock.2bigha', department: 'Legal' },
            { adminId: 'mock-legal-2', firstName: 'Ankit', lastName: 'Verma', email: 'ankit.legal@mock.2bigha', department: 'Legal' },
          ]
        : [
            { adminId: 'mock-field-1', firstName: 'Suresh', lastName: 'Yadav', email: 'suresh.field@mock.2bigha', department: 'Field' },
            { adminId: 'mock-field-2', firstName: 'Neha', lastName: 'Singh', email: 'neha.field@mock.2bigha', department: 'Field' },
          ];
  return { role, items: base, total: base.length, mock: true };
}

function isAlreadyAssignedError(message: string): boolean {
  return /already (assigned|has)|currently assigned|reassign/i.test(message);
}

@Injectable()
export class TwoBighaPmAssignmentService {
  private readonly logger = new Logger(TwoBighaPmAssignmentService.name);

  private async listRole(
    role: PmAssignRole,
    query: string,
    field: string,
    searchTerm?: string,
  ): Promise<TwoBighaPmStaffList> {
    const config = getTwoBighaConfig();
    if (!config) return mockStaff(role);

    const items: TwoBighaPmStaffItem[] = [];
    let page = 1;
    const limit = 100;
    let total = 0;
    try {
      while (page <= 20) {
        const data = await twoBighaGraphqlRequest<Record<string, ListEnvelope>>(
          config,
          query,
          { page, limit, searchTerm: searchTerm || undefined },
        );
        const envelope = data?.[field];
        const rows = envelope?.data || [];
        total = envelope?.meta?.total ?? total;
        for (const row of rows) {
          if (row?.adminId) items.push(row);
        }
        const totalPages = envelope?.meta?.totalPages || 1;
        if (page >= totalPages || rows.length < limit) break;
        page += 1;
      }
      return { role, items, total: total || items.length, mock: false };
    } catch (e: any) {
      this.logger.error(`2bigha ${field} failed: ${e?.message}`);
      return { role, items: [], total: 0, mock: false };
    }
  }

  listManagers(searchTerm?: string) {
    return this.listRole('manager', GET_MANAGERS, 'getAllFieldAgentManagers', searchTerm);
  }

  listLegalManagers(searchTerm?: string) {
    return this.listRole('legal', GET_LEGAL, 'getAllLegalManagers', searchTerm);
  }

  listFieldAgents(searchTerm?: string) {
    return this.listRole('field', GET_FIELD, 'getAllFieldAgents', searchTerm);
  }

  async isOnRoleRoster(role: PmAssignRole, adminId: string): Promise<boolean> {
    if (!adminId) return false;
    const list =
      role === 'manager'
        ? await this.listManagers()
        : role === 'legal'
          ? await this.listLegalManagers()
          : await this.listFieldAgents();
    return list.items.some((item) => String(item.adminId) === String(adminId));
  }

  async resolveUserPropertyId(opts: {
    userPropertyId?: string;
    propertyId?: string;
  }): Promise<string | undefined> {
    if (opts.userPropertyId?.trim()) return opts.userPropertyId.trim();
    const propertyId = opts.propertyId?.trim();
    if (!propertyId) return undefined;

    const config = getTwoBighaConfig();
    if (!config) return undefined;

    try {
      const data = await twoBighaGraphqlRequest<{
        getManagedPropertyDetail?: { userPropertyId?: string };
      }>(config, GET_MANAGED_DETAIL, { propertyId, userPropertyId: undefined });
      const id = data?.getManagedPropertyDetail?.userPropertyId;
      return id ? String(id) : undefined;
    } catch (e: any) {
      this.logger.warn(`getManagedPropertyDetail lookup failed: ${e?.message}`);
      return undefined;
    }
  }

  async listManagedProperties(params: TwoBighaManagedPropertyListParams = {}): Promise<{
    data: TwoBighaManagedListing[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(Math.max(1, params.limit || 25), 200);
    const empty = { data: [] as TwoBighaManagedListing[], total: 0, page, pageSize };
    const config = getTwoBighaConfig();
    if (!config) return empty;

    const stageFilter = params.pmStage && params.pmStage !== 'all' ? params.pmStage : undefined;
    // Stage filter is applied after mapping (AssignmentStatus ≠ CRM pipeline labels),
    // so pull the full result set then slice. Unfiltered list uses GraphQL pagination.
    const fetchAll = Boolean(stageFilter);
    const gqlLimit = fetchAll ? 200 : pageSize;

    try {
      const rows: ManagedPropertyItem[] = [];
      let total = 0;
      let cursor = fetchAll ? 1 : page;
      while (cursor <= 20) {
        const data = await twoBighaGraphqlRequest<{
          getAllManagedPropertiesByRole?: {
            meta?: { total?: number; totalPages?: number };
            data?: ManagedPropertyItem[];
          };
        }>(config, GET_MANAGED_BY_ROLE, {
          page: cursor,
          limit: gqlLimit,
          searchTerm: params.searchTerm || undefined,
          planName: params.planName || undefined,
        });
        const envelope = data?.getAllManagedPropertiesByRole;
        const batch = envelope?.data || [];
        total = envelope?.meta?.total ?? total;
        rows.push(...batch);
        const totalPages = envelope?.meta?.totalPages || 1;
        if (!fetchAll || cursor >= totalPages || batch.length < gqlLimit) break;
        cursor += 1;
      }

      let mapped = rows.map((item) => mapManagedItemToListing(item));
      if (stageFilter) {
        mapped = mapped.filter((row) => row.pmStage === stageFilter);
        total = mapped.length;
        const start = (page - 1) * pageSize;
        mapped = mapped.slice(start, start + pageSize);
      }

      return { data: mapped, total: total || mapped.length, page, pageSize };
    } catch (e: any) {
      this.logger.error(`2bigha getAllManagedPropertiesByRole failed: ${e?.message}`);
      return empty;
    }
  }

  async getManagedPropertyListing(id: string): Promise<TwoBighaManagedListing | null> {
    const config = getTwoBighaConfig();
    if (!config) return null;
    const parsed = parseLivePmListingId(id);
    try {
      const data = await twoBighaGraphqlRequest<{
        getManagedPropertyDetail?: ManagedPropertyItem | null;
      }>(config, GET_MANAGED_DETAIL, {
        propertyId: parsed.propertyId,
        userPropertyId: parsed.userPropertyId,
      });
      const item = data?.getManagedPropertyDetail;
      if (!item) return null;
      return mapManagedItemToListing(item);
    } catch (e: any) {
      this.logger.warn(`getManagedPropertyDetail failed for ${id}: ${e?.message}`);
      return null;
    }
  }

  async pmStageStats(): Promise<{ total: number; byPmStage: Record<string, number> }> {
    const config = getTwoBighaConfig();
    if (!config) return { total: 0, byPmStage: {} };

    try {
      const rows: ManagedPropertyItem[] = [];
      let page = 1;
      const limit = 200;
      let total = 0;
      while (page <= 20) {
        const data = await twoBighaGraphqlRequest<{
          getAllManagedPropertiesByRole?: {
            meta?: { total?: number; totalPages?: number };
            data?: ManagedPropertyItem[];
          };
        }>(config, GET_MANAGED_BY_ROLE, { page, limit });
        const envelope = data?.getAllManagedPropertiesByRole;
        const batch = envelope?.data || [];
        total = envelope?.meta?.total ?? total;
        rows.push(...batch);
        const totalPages = envelope?.meta?.totalPages || 1;
        if (page >= totalPages || batch.length < limit) break;
        page += 1;
      }
      const byPmStage: Record<string, number> = {};
      for (const item of rows) {
        const stage = assignmentStatusToPmStage(item.assignmentStatus, item);
        byPmStage[stage] = (byPmStage[stage] || 0) + 1;
      }
      return { total: total || rows.length, byPmStage };
    } catch (e: any) {
      this.logger.error(`2bigha PM stats failed: ${e?.message}`);
      return { total: 0, byPmStage: {} };
    }
  }

  async assign(
    role: PmAssignRole,
    userPropertyId: string,
    adminId: string,
    alreadyAssigned: boolean,
  ): Promise<PmWorkflowResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return {
        success: true,
        message: 'Mock mode — assignment recorded in CRM only',
        data: { mock: true, role, userPropertyId, adminId },
      };
    }

    const run = async (useReassign: boolean): Promise<PmWorkflowResult> => {
      if (role === 'manager') {
        if (useReassign) {
          const data = await twoBighaGraphqlRequest<{ reAssignPropertyToManager: PmWorkflowResult }>(
            config,
            REASSIGN_MANAGER,
            { input: { userPropertyId, newManagerId: adminId } },
          );
          return data.reAssignPropertyToManager;
        }
        const data = await twoBighaGraphqlRequest<{ assignPropertyToManager: PmWorkflowResult }>(
          config,
          ASSIGN_MANAGER,
          { input: { userPropertyId, managerId: adminId } },
        );
        return data.assignPropertyToManager;
      }
      if (role === 'legal') {
        if (useReassign) {
          const data = await twoBighaGraphqlRequest<{
            reAssignPropertyToLegalManager: PmWorkflowResult;
          }>(config, REASSIGN_LEGAL, {
            input: { userPropertyId, newLegalManagerId: adminId },
          });
          return data.reAssignPropertyToLegalManager;
        }
        const data = await twoBighaGraphqlRequest<{ assignPropertyToLegalManager: PmWorkflowResult }>(
          config,
          ASSIGN_LEGAL,
          { input: { userPropertyId, legalManagerId: adminId } },
        );
        return data.assignPropertyToLegalManager;
      }
      if (useReassign) {
        const data = await twoBighaGraphqlRequest<{
          reAssignPropertyToFieldAgent: PmWorkflowResult;
        }>(config, REASSIGN_FIELD, {
          input: { userPropertyId, newAgentId: adminId },
        });
        return data.reAssignPropertyToFieldAgent;
      }
      const data = await twoBighaGraphqlRequest<{ assignPropertyToFieldAgent: PmWorkflowResult }>(
        config,
        ASSIGN_FIELD,
        { input: { userPropertyId, agentId: adminId } },
      );
      return data.assignPropertyToFieldAgent;
    };

    try {
      const result = await run(alreadyAssigned);
      if (result && result.success === false) {
        throw new Error(result.message || 'Assignment rejected');
      }
      return result || { success: true, message: 'Assigned' };
    } catch (e: any) {
      const message = e?.message || 'Assignment failed';
      if (!alreadyAssigned && isAlreadyAssignedError(message)) {
        try {
          return await run(true);
        } catch (e2: any) {
          this.logger.error(`2bigha reassign ${role} failed: ${e2?.message}`);
          throw e2;
        }
      }
      this.logger.error(`2bigha assign ${role} failed: ${message}`);
      if (/INTERNAL_ERROR/i.test(message)) {
        throw new Error(
          `${message} — this person is not a valid ${role} on 2bigha. Use “2bigha staff (live roster)”, not System Admin / CRM team.`,
        );
      }
      throw e;
    }
  }

  async unassign(role: PmAssignRole, userPropertyId: string): Promise<PmWorkflowResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: 'Mock mode — unassigned in CRM only' };
    }
    try {
      if (role === 'manager') {
        const data = await twoBighaGraphqlRequest<{ unAssignPropertyToManager: PmWorkflowResult }>(
          config,
          UNASSIGN_MANAGER,
          { input: { userPropertyId } },
        );
        return data.unAssignPropertyToManager;
      }
      if (role === 'legal') {
        const data = await twoBighaGraphqlRequest<{
          unAssignPropertyToLegalManager: PmWorkflowResult;
        }>(config, UNASSIGN_LEGAL, { input: { userPropertyId } });
        return data.unAssignPropertyToLegalManager;
      }
      const data = await twoBighaGraphqlRequest<{ unAssignPropertyToFieldAgent: PmWorkflowResult }>(
        config,
        UNASSIGN_FIELD,
        { input: { userPropertyId } },
      );
      return data.unAssignPropertyToFieldAgent;
    } catch (e: any) {
      this.logger.error(`2bigha unassign ${role} failed: ${e?.message}`);
      throw e;
    }
  }
}
