import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

/**
 * 2bigha "Platform User" sync & Client Live Data Queries:
 * - adminCreateUser (sync CRM Client -> 2Bigha platform user)
 * - getUser (read live platform user profile)
 * - getClientMetaData (header / identity / property & farm counts / active subscription)
 * - getPropertiesByClientId (paginated properties & status counts)
 * - getClientInvoices (billing history & subscription features)
 * - getClientBillingAndUsageSummary (plan quotas & usage)
 * - getClientFeatureRequests (featured, video, legal requests board)
 * - getManagedPropertiesByClientId (PM active properties & visit quotas)
 */

export interface ClientSyncInput {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  address?: string;
  role?: string;
  existingTwobighaUserId?: string;
}

export interface TwoBighaClientSyncResult {
  status: 'synced' | 'mock' | 'failed' | 'skipped';
  twobighaUserId?: string;
  error?: string;
  syncedAt: Date;
}

const ADMIN_CREATE_USER_MUTATION = `
  mutation AdminCreateUser($input: PlatformUserInput!) {
    adminCreateUser(input: $input) {
      success
      message
      user {
        id
      }
    }
  }
`;

const GET_USER_QUERY = `
  query GetUser($id: ID!) {
    getUser(id: $id) {
      id
      email
      firstName
      lastName
      role
      isActive
      createdAt
      profile {
        id
        bio
        phone
        avatar
        city
        state
        languages
        experience
        rating
        totalReviews
      }
    }
  }
`;

const GET_CLIENT_METADATA_QUERY = `
  query GetClientMetaData($clientId: ID!) {
    getClientMetaData(clientId: $clientId) {
      client {
        id
        name
        firstName
        lastName
        email
        phone
        whatsappNumber
        avatar
        address
      }
      property {
        total
        pending
        approved
        rejected
        sold
      }
      farm {
        total
        pending
        approved
        rejected
        sold
      }
      subscription {
        planName
        billingCycle
        price
        status
        expiresAt
      }
      message
      STATUS_CODES
    }
  }
`;

/** CRM-side category for agricultural land (matched on upstream propertyType). */
const AGRICULTURAL_CATEGORY = 'AGRICULTURAL';
/** Max rows pulled per upstream bucket when filtering agricultural land locally. */
const AGRICULTURAL_SCAN_LIMIT = 500;

const GET_PROPERTIES_BY_CLIENT_ID_QUERY = `
  query GetPropertiesByClientId(
    $clientId: ID
    $page: Int
    $limit: Int
    $createdBy: ID
    $search: String
    $propertyCategory: String
    $approvalStatus: String
  ) {
    getPropertiesByClientId(
      clientId: $clientId
      page: $page
      limit: $limit
      createdBy: $createdBy
      search: $search
      propertyCategory: $propertyCategory
      approvalStatus: $approvalStatus
    ) {
      result {
        id
        title
        description
        propertyType
        status
        approvalStatus
        listingType
        price
        pricePerUnit
        area
        areaUnit
        address
        city
        district
        state
        country
        pinCode
        khasraNumber
        listingAs
        ownerName
        ownerPhone
        ownerWhatsapp
        isFeatured
        isVerified
        availablilityStatus
        viewCount
        inquiryCount
        createdAt
        publishedAt
        createdByName
        clientName
        clientPhone
        createdByUserName
        images {
          id
          variants
        }
      }
      totalCount
      counts {
        all
        pending
        approved
        rejected
        flagged
      }
      message
      STATUS_CODES
    }
  }
`;

const GET_CLIENT_INVOICES_QUERY = `
  query GetClientInvoices($clientId: ID!) {
    getClientInvoices(clientId: $clientId) {
      result {
        id
        invoiceNumber
        planName
        billingCycle
        baseAmount
        discountAmount
        netAmount
        gstAmount
        totalAmount
        gstPercent
        paymentType
        paymentMethod
        razorpayPaymentId
        startsAt
        expiresAt
        issuedAt
        subscriptionId
        features {
          featureKey
          featureValue
          displayText
        }
      }
      totalCount
      message
      STATUS_CODES
    }
  }
`;

const GET_CLIENT_BILLING_AND_USAGE_SUMMARY_QUERY = `
  query GetClientBillingAndUsageSummary($clientId: ID!) {
    getClientBillingAndUsageSummary(clientId: $clientId) {
      planName
      planTier
      expiresAt
      listings {
        used
        allowed
        remaining
      }
      featuredListings {
        used
        allowed
        remaining
      }
      socialMarketingPosts {
        used
        allowed
        remaining
      }
      propertyCount {
        used
        allowed
        remaining
      }
      firstPageVisibility {
        included
        durationType
        allowed
        used
        remaining
        activeCount
      }
    }
  }
`;

const GET_CLIENT_FEATURE_REQUESTS_QUERY = `
  query GetClientFeatureRequests($clientId: ID!) {
    getClientFeatureRequests(clientId: $clientId) {
      featured {
        id
        propertyId
        propertyTitle
        status
        approvalStatus
        adminNotes
        createdAt
        updatedAt
      }
      socialMedia {
        id
        propertyId
        propertyTitle
        status
        assignedTo
        videoLink
        estimatedAt
        completedAt
        createdAt
      }
      legal {
        id
        propertyId
        propertyTitle
        status
        adminNotes
        reviewedByName
        reviewedAt
        hasReport
        reportFileName
        reportUploadedAt
        createdAt
      }
      message
      STATUS_CODES
    }
  }
`;

const GET_MANAGED_PROPERTIES_BY_CLIENT_ID_QUERY = `
  query GetManagedPropertiesByClientId($clientId: String!, $page: Int, $limit: Int) {
    getManagedPropertiesByClientId(clientId: $clientId, page: $page, limit: $limit) {
      meta {
        page
        limit
        total
        totalPages
      }
      data {
        userPropertyId
        visitsRemaining
        visitsUsed
        assignmentStatus
        property {
          id
          title
          propertyName
          propertyType
          price
          area
          areaUnit
          address
          city
          district
          state
          khasraNumber
          status
          approvalStatus
          availabilityStatus
        }
        planDetails {
          id
          planName
          description
          billingCycle
          durationInDays
          visitsAllowed
          pricePerVisit
        }
        visits {
          id
          visitDate
          status
          agentName
        }
      }
    }
  }
`;

export interface TwoBighaPlatformUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
  createdAt?: string;
  profile?: {
    id?: string;
    bio?: string;
    phone?: string;
    avatar?: string;
    city?: string;
    state?: string;
    languages?: unknown;
    experience?: number;
    rating?: number;
    totalReviews?: number;
  } | null;
}

export interface TwoBighaClientFetchResult {
  status: 'fetched' | 'mock' | 'failed' | 'skipped';
  user?: TwoBighaPlatformUser | null;
  error?: string;
}

@Injectable()
export class TwoBighaClientService {
  private readonly logger = new Logger(TwoBighaClientService.name);

  private splitName(name: string): { firstName?: string; lastName?: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return {};
    const [firstName, ...rest] = parts;
    return { firstName, lastName: rest.join(' ') || undefined };
  }

  async syncClientCreate(client: ClientSyncInput): Promise<TwoBighaClientSyncResult> {
    const email = client.email?.trim();
    if (!email) {
      return {
        status: 'skipped',
        error: 'No email on file — 2bigha requires an email to create a platform user.',
        syncedAt: new Date(),
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return { status: 'mock', twobighaUserId: `mock-2b-user-${client._id}`, syncedAt: new Date() };
    }

    const { firstName, lastName } = this.splitName(client.name);
    try {
      const data = await twoBighaGraphqlRequest<{
        adminCreateUser?: { success?: boolean; message?: string; user?: { id?: string } | null };
      }>(config, ADMIN_CREATE_USER_MUTATION, {
        input: {
          email,
          firstName,
          lastName,
          role: client.role || undefined,
          profile: {
            phone: client.phone || undefined,
            whatsappNumber: client.whatsappNumber || undefined,
            address: client.address || undefined,
          },
        },
      });
      const id = data?.adminCreateUser?.user?.id;
      if (!data?.adminCreateUser?.success || !id) {
        throw new Error(data?.adminCreateUser?.message || '2bigha did not return a platform user id');
      }
      return { status: 'synced', twobighaUserId: String(id), syncedAt: new Date() };
    } catch (e: any) {
      const message = e?.message || 'Unknown error';
      if (/already exists/i.test(message)) {
        const existingId = client.existingTwobighaUserId?.trim();
        if (existingId) {
          return { status: 'synced', twobighaUserId: existingId, syncedAt: new Date() };
        }
      }
      this.logger.error(`2bigha adminCreateUser failed for client ${client._id}: ${message}`);
      return { status: 'failed', error: message, syncedAt: new Date() };
    }
  }

  async fetchUser(twobighaUserId?: string): Promise<TwoBighaClientFetchResult> {
    const id = twobighaUserId?.trim();
    if (!id) {
      return {
        status: 'skipped',
        error: 'This client has no 2bigha user id yet — create/sync it to 2bigha first.',
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return {
        status: 'mock',
        user: {
          id,
          email: 'mock.client@2bigha.example',
          firstName: 'Mock',
          lastName: 'Client',
          role: 'USER',
          isActive: true,
          createdAt: new Date().toISOString(),
          profile: { phone: '+910000000000', city: 'Mocktown', state: 'MockState' },
        },
      };
    }

    try {
      const data = await twoBighaGraphqlRequest<{ getUser?: TwoBighaPlatformUser | null }>(
        config,
        GET_USER_QUERY,
        { id },
      );
      return { status: 'fetched', user: data?.getUser ?? null };
    } catch (e: any) {
      this.logger.error(`2bigha getUser failed for user ${id}: ${e?.message}`);
      return { status: 'failed', error: e?.message || 'Unknown error' };
    }
  }

  // ── 1. getClientMetaData ──────────────────────────────────────────────────
  async getClientMetaData(clientId?: string): Promise<any> {
    const id = clientId?.trim();
    if (!id) {
      return {
        client: null,
        property: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        farm: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        subscription: null,
        message: 'No 2bigha client ID provided',
        STATUS_CODES: 200,
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return {
        client: { id, name: 'Mock Client' },
        property: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        farm: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        subscription: null,
        message: 'Mock client metadata',
        STATUS_CODES: 200,
      };
    }

    try {
      const data = await twoBighaGraphqlRequest<{ getClientMetaData?: any }>(
        config,
        GET_CLIENT_METADATA_QUERY,
        { clientId: id },
      );
      const meta = data?.getClientMetaData || {
        client: { id },
        property: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        farm: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        subscription: null,
      };

      // Check if this user created properties on 2Bigha
      if (!meta.property || meta.property.total === 0) {
        try {
          const createdRes = await twoBighaGraphqlRequest<{ getPropertiesByClientId?: any }>(
            config,
            GET_PROPERTIES_BY_CLIENT_ID_QUERY,
            { createdBy: id, limit: 1 },
          );
          const counts = createdRes?.getPropertiesByClientId?.counts;
          if (counts && counts.all > 0) {
            meta.property = {
              total: counts.all,
              approved: counts.approved || 0,
              pending: counts.pending || 0,
              rejected: counts.rejected || 0,
              sold: 0,
            };
          }
        } catch {}
      }

      return meta;
    } catch (e: any) {
      this.logger.error(`2bigha getClientMetaData failed for ${id}: ${e?.message}`);
      return {
        client: null,
        property: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        farm: { total: 0, pending: 0, approved: 0, rejected: 0, sold: 0 },
        subscription: null,
        message: e?.message || 'Failed to fetch client metadata',
        STATUS_CODES: 500,
      };
    }
  }

  // ── 2. getPropertiesByClientId ───────────────────────────────────────────
  async getPropertiesByClientId(params: {
    clientId?: string;
    page?: number;
    limit?: number;
    createdBy?: string;
    search?: string;
    propertyCategory?: string;
    approvalStatus?: string;
  } = {}): Promise<any> {
    const config = getTwoBighaConfig();
    if (!config) {
      return {
        result: [],
        totalCount: 0,
        counts: { all: 0, pending: 0, approved: 0, rejected: 0, flagged: 0 },
        message: 'Mock properties',
        STATUS_CODES: 200,
      };
    }

    if (params.propertyCategory === AGRICULTURAL_CATEGORY) {
      return this.getAgriculturalPropertiesByClientId(params);
    }

    try {
      const variables: Record<string, any> = {
        page: params.page ? Number(params.page) : 1,
        limit: params.limit ? Number(params.limit) : 10,
      };
      if (params.clientId) variables.clientId = params.clientId;
      if (params.createdBy) variables.createdBy = params.createdBy;
      if (params.search) variables.search = params.search;
      if (params.propertyCategory) variables.propertyCategory = params.propertyCategory;
      if (params.approvalStatus) variables.approvalStatus = params.approvalStatus;

      const data = await twoBighaGraphqlRequest<{ getPropertiesByClientId?: any }>(
        config,
        GET_PROPERTIES_BY_CLIENT_ID_QUERY,
        variables,
      );

      return data?.getPropertiesByClientId || {
        result: [],
        totalCount: 0,
        counts: { all: 0, pending: 0, approved: 0, rejected: 0, flagged: 0 },
        STATUS_CODES: 200,
      };
    } catch (e: any) {
      this.logger.error(`2bigha getPropertiesByClientId failed: ${e?.message}`);
      return {
        result: [],
        totalCount: 0,
        counts: { all: 0, pending: 0, approved: 0, rejected: 0, flagged: 0 },
        message: e?.message || 'Failed to fetch properties',
        STATUS_CODES: 500,
      };
    }
  }

  /**
   * "Agricultural Land" is a propertyType, not an upstream propertyCategory
   * (which only knows PROPERTY / FARM). Pull both buckets, keep AGRICULTURAL
   * rows, then derive status counts + approval filter + pagination locally.
   */
  private async getAgriculturalPropertiesByClientId(params: {
    clientId?: string;
    page?: number;
    limit?: number;
    createdBy?: string;
    search?: string;
    approvalStatus?: string;
  }): Promise<any> {
    const page = params.page ? Number(params.page) : 1;
    const limit = params.limit ? Number(params.limit) : 10;

    const buckets = await Promise.all(
      ['PROPERTY', 'FARM'].map((propertyCategory) =>
        this.getPropertiesByClientId({
          clientId: params.clientId,
          createdBy: params.createdBy,
          search: params.search,
          propertyCategory,
          page: 1,
          limit: AGRICULTURAL_SCAN_LIMIT,
        }),
      ),
    );

    const seen = new Set<string>();
    const agricultural = buckets
      .flatMap((b) => (Array.isArray(b?.result) ? b.result : []))
      .filter((p: any) => {
        if (String(p?.propertyType || '').toUpperCase() !== AGRICULTURAL_CATEGORY) return false;
        if (!p?.id || seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

    const byStatus = (s: string) =>
      agricultural.filter((p: any) => String(p?.approvalStatus || '').toUpperCase() === s).length;
    const counts = {
      all: agricultural.length,
      pending: byStatus('PENDING'),
      approved: byStatus('APPROVED'),
      rejected: byStatus('REJECTED'),
      flagged: byStatus('FLAGGED'),
    };

    const filtered = params.approvalStatus
      ? agricultural.filter(
          (p: any) => String(p?.approvalStatus || '').toUpperCase() === params.approvalStatus!.toUpperCase(),
        )
      : agricultural;

    const failed = buckets.find((b) => b?.STATUS_CODES === 500);
    return {
      result: filtered.slice((page - 1) * limit, page * limit),
      totalCount: filtered.length,
      counts,
      message: failed?.message,
      STATUS_CODES: failed && !agricultural.length ? 500 : 200,
    };
  }

  // ── 3. getClientInvoices─────────────────────────────────────────────────
  async getClientInvoices(clientId: string): Promise<any> {
    const id = clientId?.trim();
    if (!id) {
      return {
        result: [],
        totalCount: 0,
        message: 'No 2bigha client ID provided',
        STATUS_CODES: 200,
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return {
        result: [],
        totalCount: 0,
        message: 'Mock invoices',
        STATUS_CODES: 200,
      };
    }

    try {
      const data = await twoBighaGraphqlRequest<{ getClientInvoices?: any }>(
        config,
        GET_CLIENT_INVOICES_QUERY,
        { clientId: id },
      );
      return data?.getClientInvoices || {
        result: [],
        totalCount: 0,
        STATUS_CODES: 200,
      };
    } catch (e: any) {
      this.logger.error(`2bigha getClientInvoices failed for ${id}: ${e?.message}`);
      return {
        result: [],
        totalCount: 0,
        message: e?.message || 'Failed to fetch invoices',
        STATUS_CODES: 500,
      };
    }
  }

  // ── 4. getClientBillingAndUsageSummary ───────────────────────────────────
  async getClientBillingAndUsageSummary(clientId: string): Promise<any> {
    const id = clientId?.trim();
    if (!id) {
      return null;
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return null;
    }

    try {
      const data = await twoBighaGraphqlRequest<{ getClientBillingAndUsageSummary?: any }>(
        config,
        GET_CLIENT_BILLING_AND_USAGE_SUMMARY_QUERY,
        { clientId: id },
      );
      return data?.getClientBillingAndUsageSummary || null;
    } catch (e: any) {
      this.logger.error(`2bigha getClientBillingAndUsageSummary failed for ${id}: ${e?.message}`);
      return null;
    }
  }

  // ── 5. getClientFeatureRequests ──────────────────────────────────────────
  async getClientFeatureRequests(clientId: string): Promise<any> {
    const id = clientId?.trim();
    if (!id) {
      return {
        featured: [],
        socialMedia: [],
        legal: [],
        message: 'No 2bigha client ID provided',
        STATUS_CODES: 200,
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return {
        featured: [],
        socialMedia: [],
        legal: [],
        message: 'Mock requests',
        STATUS_CODES: 200,
      };
    }

    try {
      const data = await twoBighaGraphqlRequest<{ getClientFeatureRequests?: any }>(
        config,
        GET_CLIENT_FEATURE_REQUESTS_QUERY,
        { clientId: id },
      );
      return data?.getClientFeatureRequests || {
        featured: [],
        socialMedia: [],
        legal: [],
        STATUS_CODES: 200,
      };
    } catch (e: any) {
      this.logger.error(`2bigha getClientFeatureRequests failed for ${id}: ${e?.message}`);
      return {
        featured: [],
        socialMedia: [],
        legal: [],
        message: e?.message || 'Failed to fetch feature requests',
        STATUS_CODES: 500,
      };
    }
  }

  // ── 6. getManagedPropertiesByClientId ────────────────────────────────────
  async getManagedPropertiesByClientId(
    clientId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<any> {
    const id = clientId?.trim();
    if (!id) {
      return {
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
        data: [],
      };
    }

    const config = getTwoBighaConfig();
    if (!config) {
      return {
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
        data: [],
      };
    }

    try {
      const data = await twoBighaGraphqlRequest<{ getManagedPropertiesByClientId?: any }>(
        config,
        GET_MANAGED_PROPERTIES_BY_CLIENT_ID_QUERY,
        {
          clientId: String(id),
          page: Number(page) || 1,
          limit: Number(limit) || 10,
        },
      );
      return data?.getManagedPropertiesByClientId || {
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
        data: [],
      };
    } catch (e: any) {
      this.logger.error(`2bigha getManagedPropertiesByClientId failed for ${id}: ${e?.message}`);
      return {
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
        data: [],
      };
    }
  }
}
