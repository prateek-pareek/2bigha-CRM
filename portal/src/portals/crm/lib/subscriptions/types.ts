export interface PlanFeature {
  id: number;
  featureKey: string;
  featureValue: string;
  displayText?: string;
  sortOrder?: number;
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
