import api from "@/lib/crm/api";
import type {
  SubscriptionPlan,
  UnboundSubscription,
  ActivePropertyPlan,
  PMOrderStatus,
  ManagedPropertyDetail,
  PMPlanCatalogItem,
  PMPlanVariant,
  RazorpayOrderPayload,
  PmPaymentVerifyResult,
  LeadPmOverview,
  PmPaymentRecord,
  PmActivityEntry,
} from "./types";

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  try {
    const { data } = await api.get<SubscriptionPlan[]>("/crm/subscriptions/plans");
    return data;
  } catch (error) {
    console.error("Failed to fetch subscription plans:", error);
    return [];
  }
}

export async function fetchUnboundSubscriptions(leadId: string): Promise<UnboundSubscription[]> {
  try {
    const { data } = await api.get<UnboundSubscription[]>(`/crm/subscriptions/unbound/${leadId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch unbound subscriptions for lead ${leadId}:`, error);
    return [];
  }
}

export async function fetchActivePropertyPlan(propertyId: string): Promise<ActivePropertyPlan | null> {
  try {
    const { data } = await api.get<ActivePropertyPlan>(`/crm/subscriptions/active-plan/${propertyId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch active property plan for property ${propertyId}:`, error);
    return null;
  }
}

export async function fetchPropertyPlanHistory(propertyId: string): Promise<ActivePropertyPlan[]> {
  try {
    const { data } = await api.get<ActivePropertyPlan[]>(`/crm/subscriptions/plan-history/${propertyId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch property plan history for property ${propertyId}:`, error);
    return [];
  }
}

export async function fetchPMOrderStatus(orderId: string): Promise<PMOrderStatus | null> {
  try {
    const { data } = await api.get<PMOrderStatus>(`/crm/subscriptions/order-status/${orderId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch PM order status for order ${orderId}:`, error);
    return null;
  }
}

export async function fetchManagedPropertyDetail(propertyId: string): Promise<ManagedPropertyDetail | null> {
  try {
    const { data } = await api.get<ManagedPropertyDetail>(`/crm/subscriptions/managed-property/${propertyId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch managed property detail for property ${propertyId}:`, error);
    return null;
  }
}

export async function fetchPMPlans(): Promise<PMPlanCatalogItem[]> {
  try {
    const { data } = await api.get<PMPlanCatalogItem[]>("/crm/subscriptions/pm-plans");
    return data;
  } catch (error) {
    console.error("Failed to fetch PM plans:", error);
    return [];
  }
}

export async function fetchPMPlanVariant(variantId: number): Promise<PMPlanVariant | null> {
  try {
    const { data } = await api.get<PMPlanVariant>(`/crm/subscriptions/pm-plans/variant/${variantId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch PM plan variant ${variantId}:`, error);
    return null;
  }
}

export async function fetchLeadPmOverview(leadId: string): Promise<LeadPmOverview | null> {
  try {
    const { data } = await api.get<LeadPmOverview>(
      `/crm/property-listings/pm/lead-overview/${encodeURIComponent(leadId)}`,
    );
    return data;
  } catch (error) {
    console.error(`Failed to fetch PM overview for lead ${leadId}:`, error);
    return null;
  }
}

export async function fetchPmActivity(leadId: string): Promise<PmActivityEntry[]> {
  try {
    const { data } = await api.get<PmActivityEntry[]>(`/crm/subscriptions/pm-activity/${leadId}`);
    return data;
  } catch (error) {
    console.error(`Failed to fetch PM activity for lead ${leadId}:`, error);
    return [];
  }
}

export async function fetchPmActivityForProperty(listingId: string): Promise<PmActivityEntry[]> {
  try {
    const { data } = await api.get<PmActivityEntry[]>(
      `/crm/subscriptions/pm-activity/property/${listingId}`,
    );
    return data;
  } catch (error) {
    console.error(`Failed to fetch PM activity for property ${listingId}:`, error);
    return [];
  }
}

export async function fetchPmPayments(leadId: string): Promise<PmPaymentRecord[]> {
  try {
    const { data } = await api.get<{ payments: PmPaymentRecord[] }>(
      `/crm/subscriptions/pm-payments/${leadId}`,
    );
    return data.payments || [];
  } catch (error) {
    console.error(`Failed to fetch PM payments for lead ${leadId}:`, error);
    return [];
  }
}

export async function createPmOrder(input: {
  leadId: string;
  planId: number;
  planVariantId: number;
  billingCycle?: string;
}): Promise<RazorpayOrderPayload | null> {
  try {
    const { data } = await api.post<RazorpayOrderPayload>("/crm/subscriptions/pm-order", input);
    return data;
  } catch (error) {
    console.error("Failed to create PM order:", error);
    throw error;
  }
}

export async function verifyPmPayment(input: {
  leadId: string;
  planId: number;
  billingCycle?: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<PmPaymentVerifyResult | null> {
  try {
    const { data } = await api.post<PmPaymentVerifyResult>("/crm/subscriptions/pm-order/verify", input);
    return data;
  } catch (error) {
    console.error("Failed to verify PM payment:", error);
    throw error;
  }
}
