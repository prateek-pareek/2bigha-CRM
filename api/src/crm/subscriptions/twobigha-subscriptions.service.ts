import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

export interface UnboundSubscription {
  subscriptionId: number;
  planName: string;
  price: number;
  durationMonths: number;
  visitsPerCycle: number;
  purchasedAt: string;
}

export interface ActivePropertyPlan {
  userPropertyId: string;
  propertyId: string;
  planVariantId: number;
  planName: string;
  billingCycle: string;
  price: number;
  startDate?: string;
  endDate?: string;
  visitsRemaining?: number;
  visitsUsed?: number;
  status: string;
  orderId?: string;
}

export interface PMOrderStatus {
  orderId: string;
  status: string;
  userPropertyId?: string;
}

export interface PlanFeature {
  id: number;
  featureKey: string;
  featureValue: string;
  displayText?: string;
  sortOrder?: number;
}

export interface UserData {
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  role: string;
}

export interface AdminMini {
  id: string;
  name: string;
  role: string;
}

function mapAdminMini(raw?: {
  adminId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  id?: string;
  name?: string;
  role?: string;
} | null): AdminMini | undefined {
  if (!raw) return undefined;
  const id = raw.adminId || raw.id;
  const name =
    raw.name ||
    [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() ||
    raw.email ||
    id;
  if (!id && !name) return undefined;
  return { id: id || '', name: name || '', role: raw.role || '' };
}

function parseLivePropertyRef(id: string): { propertyId?: string; userPropertyId?: string } {
  if (!id) return {};
  if (id.startsWith('pm_prop_')) return { propertyId: id.slice('pm_prop_'.length) };
  if (id.startsWith('pm_')) return { userPropertyId: id.slice(3) };
  // Never pass the same uuid as both arguments — 2bigha returns null / INTERNAL_ERROR.
  return { userPropertyId: id };
}

export interface PMPlanDetails {
  planId: number;
  planName: string;
  billingCycle: string;
  durationDays: number;
  visitsAllowed: number;
  price: number;
}

export interface ManagedPropertyDetail {
  userPropertyId: string;
  subscriptionStatus: string;
  assignmentStatus: string;
  visitsIncluded: number;
  visitsRemaining: number;
  visitsUsed: number;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  managerAssignedAt?: string;
  agentAssignedAt?: string;
  legalManagerAssignedAt?: string;
  managerAssignedBy?: string;
  agentAssignedBy?: string;
  preVerificationDone: boolean;
  subscriptionCreatedAt: string;
  subscriptionUpdatedAt: string;
  legalCheckStatus?: string;
  legalCheckNote?: string;
  legalCheckStartedAt?: string;
  legalCheckCompletedAt?: string;
  user: UserData;
  property: any;
  images: any[];
  planDetails: PMPlanDetails;
  assignedManager?: AdminMini;
  assignedAgent?: AdminMini;
  assignedLegalManager?: AdminMini;
  visits: any;
  tickets: any[];
}

export interface PlanPricing {
  id: number;
  billingCycle: string;
  basePrice: number;
  originalPrice?: number;
  gstPercent: number;
  isBlur: boolean;
  features: PlanFeature[];
  isCurrentPlan: boolean;
  isExpiredPlan: boolean;
  isDisabled: boolean;
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  tier: number;
  displayLabel?: string;
  isPopular: boolean;
  isActive: boolean;
  pricing: PlanPricing[];
  features: PlanFeature[];
}

/** PM plan catalog from getPMPlans — distinct from marketplace subscriptionPlans. */
export interface PMPlanVariant {
  id: number;
  planId: number;
  planName: string;
  billingCycle: string;
  price: number;
  durationMonths: number;
  visitsPerCycle: number;
  preVerificationIncluded?: boolean;
  discountPercentage?: number;
  gstApplicable?: boolean;
  gstRate?: number;
}

export interface PMPlanCatalogItem {
  planId: number;
  planName: string;
  slug: string;
  description?: string;
  basePrice: number;
  sortOrder: number;
  variants: PMPlanVariant[];
}

export interface RazorpayOrderPayload {
  orderId: string;
  amount: number;
  currency?: string;
  keyId?: string;
  discount?: number;
  netAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
}

export interface PmPaymentVerifyResult {
  success: boolean;
  message?: string;
  subscriptionId?: number;
  paymentId?: number;
}

export interface LeadPmPropertyOverview {
  id: string;
  title?: string;
  userPropertyId?: string;
  twobighaPropertyId?: string;
  pmStage?: string;
  assignmentStatus?: string;
  subscriptionStatus?: string;
  legalCheckStatus?: string;
  visitsRemaining?: number;
  visitsUsed?: number;
  rmName?: string;
  legalName?: string;
  fieldName?: string;
  source: 'crm' | 'twobigha';
}

export interface LeadPmOverview {
  twobighaUserId?: string;
  unboundSubscriptions: UnboundSubscription[];
  activePlans: ActivePropertyPlan[];
  activeSubscriptions: PmSubscriptionRecord[];
  paymentHistory: PmPaymentRecord[];
  properties: LeadPmPropertyOverview[];
  combinedStatus?: string;
}

export interface PmPaymentRecord {
  id: number;
  planName?: string;
  billingCycle?: string;
  totalAmount?: number;
  status: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  propertyTitle?: string;
  initiatedAt?: string;
  completedAt?: string;
}

export interface PmSubscriptionRecord {
  id: string;
  subscriptionId?: number;
  planName?: string;
  billingCycle?: string;
  status: string;
  assignmentStatus?: string;
  propertyTitle?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
}

@Injectable()
export class TwoBighaSubscriptionsService {
  private readonly logger = new Logger(TwoBighaSubscriptionsService.name);

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const config = getTwoBighaConfig();
    
    if (!config) {
      this.logger.log('Returning mock subscription plans since TWOBIGHA_USE_MOCK=true or credentials missing.');
      return this.getMockPlans();
    }

    const query = `
      query subscriptionPlans {
        subscriptionPlans {
          id
          name
          tier
          displayLabel
          isPopular
          isActive
          pricing {
            id
            billingCycle
            basePrice
            originalPrice
            gstPercent
            isBlur
            features {
              id
              featureKey
              featureValue
              displayText
              sortOrder
            }
            isCurrentPlan
            isExpiredPlan
            isDisabled
          }
          features {
            id
            featureKey
            featureValue
            displayText
            sortOrder
          }
        }
      }
    `;

    try {
      const data = await twoBighaGraphqlRequest<{ subscriptionPlans: SubscriptionPlan[] }>(
        config,
        query,
        {},
      );
      return data?.subscriptionPlans || [];
    } catch (error) {
      this.logger.error(`Failed to fetch subscription plans: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async getUnboundSubscriptions(userId: string): Promise<UnboundSubscription[]> {
    const config = getTwoBighaConfig();
    
    if (!config) {
      this.logger.log('Returning mock unbound subscriptions since TWOBIGHA_USE_MOCK=true or credentials missing.');
      return this.getMockUnboundSubscriptions();
    }

    const query = `
      query getUnboundSubscriptionsByUserId($userId: String!) {
        getUnboundSubscriptionsByUserId(userId: $userId) {
          subscriptionId
          planName
          price
          durationMonths
          visitsPerCycle
          purchasedAt
        }
      }
    `;

    try {
      const data = await twoBighaGraphqlRequest<{ getUnboundSubscriptionsByUserId: UnboundSubscription[] }>(
        config,
        query,
        { userId },
      );
      return data?.getUnboundSubscriptionsByUserId || [];
    } catch (error) {
      this.logger.error(`Failed to fetch unbound subscriptions: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private getMockUnboundSubscriptions(): UnboundSubscription[] {
    return [
      {
        subscriptionId: 101,
        planName: 'Starter PM',
        price: 999,
        durationMonths: 12,
        visitsPerCycle: 4,
        purchasedAt: new Date().toISOString(),
      },
    ];
  }

  async getActivePropertyPlan(propertyId: string): Promise<ActivePropertyPlan | null> {
    const config = getTwoBighaConfig();
    
    if (!config) {
      this.logger.log('Returning mock active property plan since TWOBIGHA_USE_MOCK=true or credentials missing.');
      return this.getMockActivePropertyPlan(propertyId);
    }

    const query = `
      query getActivePropertyPlan($propertyId: String!) {
        getActivePropertyPlan(propertyId: $propertyId) {
          userPropertyId
          propertyId
          planVariantId
          planName
          billingCycle
          price
          startDate
          endDate
          visitsRemaining
          visitsUsed
          status
          orderId
        }
      }
    `;

    try {
      const data = await twoBighaGraphqlRequest<{ getActivePropertyPlan: ActivePropertyPlan }>(
        config,
        query,
        { propertyId: parseLivePropertyRef(propertyId).propertyId || propertyId },
      );
      return data?.getActivePropertyPlan || null;
    } catch (error) {
      this.logger.warn(`Failed to fetch active property plan: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private getMockActivePropertyPlan(propertyId: string): ActivePropertyPlan {
    const start = new Date();
    start.setDate(start.getDate() - 15);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);

    return {
      userPropertyId: 'user_prop_mock_123',
      propertyId,
      planVariantId: 1,
      planName: 'Premium PM',
      billingCycle: 'YEARLY',
      price: 24999,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      visitsRemaining: 8,
      visitsUsed: 4,
      status: 'ACTIVE',
      orderId: 'order_mock_456',
    };
  }

  async getPropertyPlanHistory(propertyId: string): Promise<ActivePropertyPlan[]> {
    const config = getTwoBighaConfig();
    
    if (!config) {
      this.logger.log('Returning mock property plan history since TWOBIGHA_USE_MOCK=true or credentials missing.');
      return this.getMockPropertyPlanHistory(propertyId);
    }

    const query = `
      query getPropertyPlanHistory($propertyId: String!) {
        getPropertyPlanHistory(propertyId: $propertyId) {
          userPropertyId
          propertyId
          planVariantId
          planName
          billingCycle
          price
          startDate
          endDate
          visitsRemaining
          visitsUsed
          status
          orderId
        }
      }
    `;

    try {
      const data = await twoBighaGraphqlRequest<{ getPropertyPlanHistory: ActivePropertyPlan[] }>(
        config,
        query,
        { propertyId: parseLivePropertyRef(propertyId).propertyId || propertyId },
      );
      return data?.getPropertyPlanHistory || [];
    } catch (error) {
      this.logger.error(`Failed to fetch property plan history: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  private getMockPropertyPlanHistory(propertyId: string): ActivePropertyPlan[] {
    const activePlan = this.getMockActivePropertyPlan(propertyId);
    
    const oldStart = new Date(activePlan.startDate!);
    oldStart.setFullYear(oldStart.getFullYear() - 1);
    const oldEnd = new Date(activePlan.startDate!);

    const oldPlan: ActivePropertyPlan = {
      userPropertyId: 'user_prop_mock_001',
      propertyId,
      planVariantId: 2,
      planName: 'Starter PM',
      billingCycle: 'YEARLY',
      price: 9999,
      startDate: oldStart.toISOString(),
      endDate: oldEnd.toISOString(),
      visitsRemaining: 0,
      visitsUsed: 4,
      status: 'EXPIRED',
      orderId: 'order_mock_001',
    };

    return [activePlan, oldPlan];
  }

  async getPMOrderStatus(orderId: string): Promise<PMOrderStatus | null> {
    const config = getTwoBighaConfig();
    
    if (!config) {
      this.logger.log('Returning mock PM order status since TWOBIGHA_USE_MOCK=true or credentials missing.');
      return this.getMockPMOrderStatus(orderId);
    }

    const query = `
      query getPMOrderStatus($orderId: String!) {
        getPMOrderStatus(orderId: $orderId) {
          orderId
          status
          userPropertyId
        }
      }
    `;

    try {
      const data = await twoBighaGraphqlRequest<{ getPMOrderStatus: PMOrderStatus }>(
        config,
        query,
        { orderId },
      );
      return data?.getPMOrderStatus || null;
    } catch (error) {
      this.logger.error(`Failed to fetch PM order status: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private getMockPMOrderStatus(orderId: string): PMOrderStatus {
    return {
      orderId,
      status: 'SUCCESS',
      userPropertyId: 'user_prop_mock_123',
    };
  }

  async getManagedPropertyDetail(propertyId: string): Promise<ManagedPropertyDetail | null> {
    const config = getTwoBighaConfig();

    if (!config) {
      this.logger.log('Returning mock managed property detail since TWOBIGHA_USE_MOCK=true or credentials missing.');
      return this.getMockManagedPropertyDetail(propertyId);
    }

    const query = `
      query getManagedPropertyDetail($propertyId: String, $userPropertyId: String) {
        getManagedPropertyDetail(propertyId: $propertyId, userPropertyId: $userPropertyId) {
          userPropertyId
          subscriptionStatus
          assignmentStatus
          visitsIncluded
          visitsRemaining
          visitsUsed
          subscriptionStartDate
          subscriptionEndDate
          managerAssignedAt
          agentAssignedAt
          legalManagerAssignedAt
          managerAssignedBy
          agentAssignedBy
          preVerificationDone
          subscriptionCreatedAt
          subscriptionUpdatedAt
          legalCheckStatus
          legalCheckNote
          legalCheckStartedAt
          legalCheckCompletedAt
          user {
            userId
            firstName
            lastName
            phone
            email
            role
          }
          planDetails {
            planId
            planName
            billingCycle
            durationDays
            visitsAllowed
            price
          }
          assignedManager {
            adminId
            firstName
            lastName
            email
          }
          assignedAgent {
            adminId
            firstName
            lastName
            email
          }
          assignedLegalManager {
            adminId
            firstName
            lastName
            email
          }
          visits
          tickets {
            id
            status
          }
        }
      }
    `;

    try {
      const refs = parseLivePropertyRef(propertyId);
      const data = await twoBighaGraphqlRequest<{ getManagedPropertyDetail: ManagedPropertyDetail }>(
        config,
        query,
        { propertyId: refs.propertyId, userPropertyId: refs.userPropertyId },
      );
      const detail = data?.getManagedPropertyDetail;
      if (!detail) return null;
      return {
        ...detail,
        assignedManager: mapAdminMini(detail.assignedManager as any),
        assignedAgent: mapAdminMini(detail.assignedAgent as any),
        assignedLegalManager: mapAdminMini(detail.assignedLegalManager as any),
      };
    } catch (error) {
      this.logger.error(`Failed to fetch managed property detail: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private getMockManagedPropertyDetail(propertyId: string): ManagedPropertyDetail {
    const now = new Date().toISOString();
    return {
      userPropertyId: 'user_prop_mock_123',
      subscriptionStatus: 'ACTIVE',
      assignmentStatus: 'ASSIGNED_TO_FIELD_AGENT',
      visitsIncluded: 12,
      visitsRemaining: 10,
      visitsUsed: 2,
      subscriptionStartDate: now,
      subscriptionEndDate: now,
      managerAssignedAt: now,
      agentAssignedAt: now,
      legalManagerAssignedAt: now,
      managerAssignedBy: 'System',
      agentAssignedBy: 'RM',
      preVerificationDone: true,
      subscriptionCreatedAt: now,
      subscriptionUpdatedAt: now,
      legalCheckStatus: 'Completed',
      legalCheckNote: 'All documents verified successfully.',
      legalCheckStartedAt: now,
      legalCheckCompletedAt: now,
      user: {
        userId: 'user_mock_123',
        firstName: 'Rahul',
        lastName: 'Sharma',
        phone: '+919876543210',
        email: 'rahul@example.com',
        role: 'CUSTOMER'
      },
      property: {},
      images: [],
      planDetails: {
        planId: 1,
        planName: 'Premium PM',
        billingCycle: 'YEARLY',
        durationDays: 365,
        visitsAllowed: 12,
        price: 24999
      },
      assignedManager: {
        id: 'admin_rm_1',
        name: 'Prateek RM',
        role: 'regional_manager'
      },
      assignedAgent: {
        id: 'admin_agent_1',
        name: 'Field Agent Singh',
        role: 'field_agent'
      },
      assignedLegalManager: {
        id: 'admin_legal_1',
        name: 'Legal Manager Rao',
        role: 'legal_manager'
      },
      visits: [{ visitId: 'v1', status: 'COMPLETED' }, { visitId: 'v2', status: 'PENDING' }],
      tickets: [{ id: 't1', status: 'OPEN' }],
    };
  }

  async getPMPlans(): Promise<PMPlanCatalogItem[]> {
    const config = getTwoBighaConfig();
    if (!config) {
      return [
        {
          planId: 1,
          planName: 'Standard PM',
          slug: 'standard-pm',
          basePrice: 9999,
          sortOrder: 0,
          variants: [
            {
              id: 1,
              planId: 1,
              planName: 'Standard PM',
              billingCycle: 'YEARLY',
              price: 9999,
              durationMonths: 12,
              visitsPerCycle: 4,
            },
          ],
        },
      ];
    }
    const query = `
      query GetPMPlans {
        getPMPlans {
          planId
          planName
          slug
          description
          basePrice
          sortOrder
          variants {
            id
            planId
            planName
            billingCycle
            price
            durationMonths
            visitsPerCycle
            preVerificationIncluded
            discountPercentage
            gstApplicable
            gstRate
          }
        }
      }
    `;
    const data = await twoBighaGraphqlRequest<{ getPMPlans: PMPlanCatalogItem[] }>(config, query, {});
    return data?.getPMPlans || [];
  }

  async getPMPlanVariant(variantId: number) {
    const config = getTwoBighaConfig();
    if (!config) return null;
    const query = `
      query GetPMPlanVariant($variantId: Int!) {
        getPMPlanVariant(variantId: $variantId) {
          id
          planId
          planName
          billingCycle
          price
          durationMonths
          visitsPerCycle
          preVerificationIncluded
          discountPercentage
          gstApplicable
          gstRate
        }
      }
    `;
    const data = await twoBighaGraphqlRequest<{ getPMPlanVariant: PMPlanVariant }>(config, query, {
      variantId,
    });
    return data?.getPMPlanVariant || null;
  }

  async createPmOrderForUser(input: {
    userId: string;
    planId: number;
    planVariantId: number;
    billingCycle?: string;
    gstDetails?: { gstin: string; businessName: string; businessAddress: string; pinCode: string };
  }): Promise<RazorpayOrderPayload & { razorpayOrderId?: string }> {
    const config = getTwoBighaConfig();
    if (!config) {
      return {
        orderId: 'mock-order-1',
        razorpayOrderId: 'order_mock_razorpay',
        amount: 999900,
        currency: 'INR',
        keyId: 'mock_key',
      };
    }

    // PM plan orders must use pmAdminCreatePlanOrder (CRM API key). Marketplace
    // adminCreateSubscriptionOrder reads plan_pricing (wrong table) and createPMOrder
    // requires an end-user JWT.
    const pmAdminMutation = `
      mutation PmAdminCreatePlanOrder($userId: String!, $planVariantId: Int!) {
        pmAdminCreatePlanOrder(userId: $userId, planVariantId: $planVariantId) {
          orderId
          razorpayOrderId
          amount
          currency
          keyId
        }
      }
    `;

    const data = await twoBighaGraphqlRequest<{
      pmAdminCreatePlanOrder?: RazorpayOrderPayload & { razorpayOrderId?: string };
    }>(config, pmAdminMutation, {
      userId: input.userId,
      planVariantId: input.planVariantId,
    });
    const order = data?.pmAdminCreatePlanOrder;
    if (!order) throw new Error('pmAdminCreatePlanOrder returned empty');
    return {
      ...order,
      razorpayOrderId: order.razorpayOrderId || order.orderId,
    };
  }

  async verifyPmPaymentForUser(input: {
    userId: string;
    planId: number;
    billingCycle?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<PmPaymentVerifyResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      return { success: true, message: 'Mock payment verified', subscriptionId: 101, paymentId: 1 };
    }
    const pmAdminMutation = `
      mutation PmAdminVerifyPlanOrder(
        $razorpayOrderId: String!
        $razorpayPaymentId: String!
        $razorpaySignature: String!
      ) {
        pmAdminVerifyPlanOrder(
          razorpayOrderId: $razorpayOrderId
          razorpayPaymentId: $razorpayPaymentId
          razorpaySignature: $razorpaySignature
        ) {
          success
          message
        }
      }
    `;
    const data = await twoBighaGraphqlRequest<{ pmAdminVerifyPlanOrder?: PmPaymentVerifyResult }>(
      config,
      pmAdminMutation,
      {
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
      },
    );
    const res = data?.pmAdminVerifyPlanOrder;
    if (!res) throw new Error('pmAdminVerifyPlanOrder returned empty');
    return res;
  }

  async getPmPaymentHistory(
    search: string,
    page = 1,
    limit = 10,
  ): Promise<{ payments: PmPaymentRecord[]; totalCount: number }> {
    const config = getTwoBighaConfig();
    const term = search?.trim();
    if (!config || !term) return { payments: [], totalCount: 0 };

    const query = `
      query PmAdminListPayments($search: String, $page: Int, $limit: Int) {
        pmAdminListPayments(search: $search, page: $page, limit: $limit) {
          totalCount
          payments {
            id
            planName
            billingCycle
            totalAmount
            status
            razorpayOrderId
            razorpayPaymentId
            propertyTitle
            initiatedAt
            completedAt
          }
        }
      }
    `;
    try {
      const data = await twoBighaGraphqlRequest<{
        pmAdminListPayments?: { totalCount: number; payments: PmPaymentRecord[] };
      }>(config, query, { search: term, page, limit });
      const block = data?.pmAdminListPayments;
      return { payments: block?.payments || [], totalCount: block?.totalCount || 0 };
    } catch (error) {
      this.logger.warn(
        `getPmPaymentHistory failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { payments: [], totalCount: 0 };
    }
  }

  async getPmActiveSubscriptions(
    search: string,
    page = 1,
    limit = 10,
  ): Promise<{ subscriptions: PmSubscriptionRecord[]; totalCount: number }> {
    const config = getTwoBighaConfig();
    const term = search?.trim();
    if (!config || !term) return { subscriptions: [], totalCount: 0 };

    const query = `
      query PmAdminListActiveSubscriptions($search: String, $page: Int, $limit: Int) {
        pmAdminListActiveSubscriptions(search: $search, page: $page, limit: $limit) {
          totalCount
          subscriptions {
            id
            subscriptionId
            planName
            billingCycle
            status
            assignmentStatus
            propertyTitle
            startDate
            endDate
            createdAt
          }
        }
      }
    `;
    try {
      const data = await twoBighaGraphqlRequest<{
        pmAdminListActiveSubscriptions?: { totalCount: number; subscriptions: PmSubscriptionRecord[] };
      }>(config, query, { search: term, page, limit });
      const block = data?.pmAdminListActiveSubscriptions;
      return { subscriptions: block?.subscriptions || [], totalCount: block?.totalCount || 0 };
    } catch (error) {
      this.logger.warn(
        `getPmActiveSubscriptions failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { subscriptions: [], totalCount: 0 };
    }
  }

  async getLeadPmOverview(opts: {
    twobighaUserId?: string;
    leadPhone?: string;
    leadEmail?: string;
    crmProperties?: Array<{
      _id: string;
      title?: string;
      userPropertyId?: string;
      twobighaPropertyId?: string;
      pmStage?: string;
    }>;
  }): Promise<LeadPmOverview> {
    const userId = opts.twobighaUserId?.trim();
    const unbound = userId ? await this.getUnboundSubscriptions(userId) : [];

    const properties: LeadPmPropertyOverview[] = [];
    const seen = new Set<string>();

    for (const row of opts.crmProperties || []) {
      const key = row.userPropertyId || row._id;
      seen.add(key);
      let detail: ManagedPropertyDetail | null = null;
      if (row.userPropertyId || row.twobighaPropertyId) {
        detail = await this.getManagedPropertyDetail(
          row.userPropertyId ? `pm_${row.userPropertyId}` : row.twobighaPropertyId!,
        );
      }
      properties.push({
        id: row._id,
        title: row.title,
        userPropertyId: row.userPropertyId || detail?.userPropertyId,
        twobighaPropertyId: row.twobighaPropertyId,
        pmStage: row.pmStage,
        assignmentStatus: detail?.assignmentStatus,
        subscriptionStatus: detail?.subscriptionStatus,
        legalCheckStatus: detail?.legalCheckStatus,
        visitsRemaining: detail?.visitsRemaining,
        visitsUsed: detail?.visitsUsed,
        rmName: detail?.assignedManager?.name,
        legalName: detail?.assignedLegalManager?.name,
        fieldName: detail?.assignedAgent?.name,
        source: 'crm',
      });
    }

    const searchTerm = opts.leadPhone?.trim() || opts.leadEmail?.trim();
    if (searchTerm && userId) {
      const config = getTwoBighaConfig();
      if (config) {
        try {
          const query = `
            query SearchManaged($searchTerm: String, $limit: Int) {
              getAllManagedPropertiesByRole(searchTerm: $searchTerm, limit: $limit, page: 1) {
                data {
                  userPropertyId
                  assignmentStatus
                  subscriptionStatus
                  legalCheckStatus
                  visitsRemaining
                  visitsUsed
                  assignedManager { firstName lastName }
                  assignedLegalManager { firstName lastName }
                  assignedAgent { firstName lastName }
                  property { id title propertyName }
                }
              }
            }
          `;
          const data = await twoBighaGraphqlRequest<{
            getAllManagedPropertiesByRole?: {
              data?: Array<Record<string, any>>;
            };
          }>(config, query, { searchTerm, limit: 20 });
          for (const item of data?.getAllManagedPropertiesByRole?.data || []) {
            const upid = item.userPropertyId as string;
            if (!upid || seen.has(upid)) continue;
            seen.add(upid);
            properties.push({
              id: `pm_${upid}`,
              title: item.property?.title || item.property?.propertyName,
              userPropertyId: upid,
              twobighaPropertyId: item.property?.id,
              assignmentStatus: item.assignmentStatus,
              subscriptionStatus: item.subscriptionStatus,
              legalCheckStatus: item.legalCheckStatus,
              visitsRemaining: item.visitsRemaining,
              visitsUsed: item.visitsUsed,
              rmName: [item.assignedManager?.firstName, item.assignedManager?.lastName]
                .filter(Boolean)
                .join(' '),
              legalName: [item.assignedLegalManager?.firstName, item.assignedLegalManager?.lastName]
                .filter(Boolean)
                .join(' '),
              fieldName: [item.assignedAgent?.firstName, item.assignedAgent?.lastName]
                .filter(Boolean)
                .join(' '),
              source: 'twobigha',
            });
          }
        } catch (e: any) {
          this.logger.warn(`getAllManagedPropertiesByRole search failed: ${e?.message}`);
        }
      }
    }

    const activePlans: ActivePropertyPlan[] = [];
    for (const p of properties) {
      const ref = p.userPropertyId ? `pm_${p.userPropertyId}` : p.twobighaPropertyId;
      if (ref) {
        const plan = await this.getActivePropertyPlan(ref);
        if (plan) activePlans.push(plan);
      }
    }

    const searchForPayments = opts.leadEmail?.trim() || opts.leadPhone?.trim() || '';
    const [paymentBlock, subscriptionBlock] = searchForPayments
      ? await Promise.all([
          this.getPmPaymentHistory(searchForPayments, 1, 15),
          this.getPmActiveSubscriptions(searchForPayments, 1, 10),
        ])
      : [{ payments: [], totalCount: 0 }, { subscriptions: [], totalCount: 0 }];

    const hasBoundSubscription =
      activePlans.length > 0 ||
      subscriptionBlock.subscriptions.some((s) => s.status === 'ACTIVE') ||
      properties.some((p) => p.subscriptionStatus === 'ACTIVE');

    const primary = properties[0];
    const combinedStatus = primary
      ? [
          primary.subscriptionStatus,
          primary.assignmentStatus,
          primary.legalCheckStatus,
          primary.pmStage,
        ]
          .filter(Boolean)
          .join(' · ')
      : unbound.length
        ? `${unbound.length} unbound credit(s) — no property bound yet`
        : hasBoundSubscription
          ? 'PM subscription active — bound to property'
          : paymentBlock.payments.some((p) => p.status === 'SUCCESS')
            ? 'Payment recorded — awaiting property bind'
            : undefined;

    return {
      twobighaUserId: userId,
      unboundSubscriptions: unbound,
      activePlans,
      activeSubscriptions: subscriptionBlock.subscriptions,
      paymentHistory: paymentBlock.payments,
      properties,
      combinedStatus,
    };
  }

  private getMockPlans(): SubscriptionPlan[] {
    return [
      {
        id: 1,
        name: 'Basic',
        tier: 1,
        displayLabel: 'Starter',
        isPopular: false,
        isActive: true,
        pricing: [
          {
            id: 1,
            billingCycle: 'MONTHLY',
            basePrice: 9.99,
            gstPercent: 18,
            isBlur: false,
            isCurrentPlan: false,
            isExpiredPlan: false,
            isDisabled: false,
            features: [],
          },
        ],
        features: [
          {
            id: 1,
            featureKey: 'max_users',
            featureValue: '5',
            displayText: 'Up to 5 Users',
            sortOrder: 1,
          },
        ],
      },
    ];
  }
}
