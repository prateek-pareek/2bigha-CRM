import api from "@/lib/crm/api";
import type { SubscriptionPlan, UnboundSubscription, ActivePropertyPlan, PMOrderStatus, ManagedPropertyDetail } from "./types";

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
