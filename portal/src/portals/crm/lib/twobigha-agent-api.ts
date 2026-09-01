import api from "@/lib/crm/api";
import type { TwoBighaSyncStatus } from "@/lib/crm/twobigha-client-api";

/**
 * Agent (Admin) — Create & Fetch, proxied through NestJS
 * (`/crm-users/twobigha/*` → TwoBighaAgentService). The portal never
 * calls 2bigha's GraphQL endpoint directly.
 */

export interface TwoBighaAdmin {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  employeeId?: string;
  phone?: string;
  isActive?: boolean;
  isVerified?: boolean;
  createdAt?: string;
}

export interface TwoBighaAgentFetchResult {
  status: "fetched" | "mock" | "failed";
  admins: TwoBighaAdmin[];
  total: number;
  hasMore: boolean;
  error?: string;
}

export interface TwoBighaAgentSummaryRow {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  twobighaAdminId?: string;
  twobighaSyncStatus?: TwoBighaSyncStatus;
  twobighaSyncError?: string;
  twobighaSyncedAt?: string;
}

export interface TwoBighaAgentsSummary {
  counts: Record<string, number>;
  total: number;
  items: TwoBighaAgentSummaryRow[];
}

export interface TwoBighaAgentResyncResult {
  _id: string;
  twobighaAdminId?: string;
  twobighaSyncStatus?: TwoBighaSyncStatus;
  twobighaSyncError?: string;
  twobighaSyncedAt?: string;
}

/** Read 2bigha's agent list (`getAllAdmins`) for reconciliation. */
export async function fetchTwoBighaAdmins(params: {
  search?: string;
  isActive?: boolean;
  department?: string;
  roleSlug?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<TwoBighaAgentFetchResult> {
  const { data } = await api.get<TwoBighaAgentFetchResult>("/crm-users/twobigha/admins", { params });
  return data;
}

/** Manual retry — `createAdmin` for an existing CRM user. */
export async function resyncTwoBighaAgent(userId: string): Promise<TwoBighaAgentResyncResult> {
  const { data } = await api.post<TwoBighaAgentResyncResult>(`/crm-users/${userId}/twobigha-sync`);
  return data;
}

/** Sync-health rollup for the Settings → 2bigha Sync hub (Agents tab). */
export async function fetchTwoBighaAgentsSummary(): Promise<TwoBighaAgentsSummary> {
  const { data } = await api.get<TwoBighaAgentsSummary>("/crm-users/twobigha/summary");
  return data;
}
