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

export interface PMPlanVariant {
  id: number;
  planId: number;
  planName: string;
  billingCycle: string;
  durationDays?: number;
  durationMonths?: number;
  visitsAllowed?: number;
  visitsPerCycle?: number;
  price: number;
  originalPrice?: number;
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
  razorpayOrderId?: string;
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
  source: "crm" | "twobigha";
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

export interface PmActivityEntry {
  id: string;
  eventType: string;
  title: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
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
