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
        { propertyId },
      );
      return data?.getActivePropertyPlan || null;
    } catch (error) {
      this.logger.error(`Failed to fetch active property plan: ${error instanceof Error ? error.message : String(error)}`);
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
        { propertyId },
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
      query getManagedPropertyDetail($propertyId: String) {
        getManagedPropertyDetail(propertyId: $propertyId) {
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
            id
            name
            role
          }
          assignedAgent {
            id
            name
            role
          }
          assignedLegalManager {
            id
            name
            role
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
      const data = await twoBighaGraphqlRequest<{ getManagedPropertyDetail: ManagedPropertyDetail }>(
        config,
        query,
        { propertyId },
      );
      return data?.getManagedPropertyDetail || null;
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
      tickets: [{ id: 't1', status: 'OPEN' }]
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
