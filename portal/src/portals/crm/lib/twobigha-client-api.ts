import api from "@/lib/crm/api";

/**
 * Platform User (Client) — Create & Fetch, proxied through NestJS
 * (`/crm/clients/:id/twobigha-*` → TwoBighaClientService). The portal
 * never calls 2bigha's GraphQL endpoint directly.
 */

export type TwoBighaSyncStatus = "synced" | "mock" | "failed" | "skipped" | "not_synced";

export interface TwoBighaPlatformUserProfile {
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
}

export interface TwoBighaPlatformUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  isActive?: boolean;
  createdAt?: string;
  profile?: TwoBighaPlatformUserProfile | null;
}

export interface TwoBighaClientFetchResult {
  status: "fetched" | "mock" | "failed" | "skipped";
  user?: TwoBighaPlatformUser | null;
  error?: string;
}

export interface TwoBighaClientResyncResult {
  _id: string;
  twobighaUserId?: string;
  twobighaSyncStatus?: TwoBighaSyncStatus;
  twobighaSyncError?: string;
  twobighaSyncedAt?: string;
}

export interface TwoBighaClientSummaryRow {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
  twobighaUserId?: string;
  twobighaSyncStatus?: TwoBighaSyncStatus;
  twobighaSyncError?: string;
  twobighaSyncedAt?: string;
}

export interface TwoBighaClientsSummary {
  counts: Record<string, number>;
  total: number;
  items: TwoBighaClientSummaryRow[];
}

/** Live 2bigha profile for a CRM client (`getUser`). */
export async function fetchTwoBighaClientProfile(clientId: string): Promise<TwoBighaClientFetchResult> {
  const { data } = await api.get<TwoBighaClientFetchResult>(`/crm/clients/${clientId}/twobigha-profile`);
  return data;
}

/** Manual retry — `adminCreateUser` for an existing CRM client. */
export async function resyncTwoBighaClient(clientId: string): Promise<TwoBighaClientResyncResult> {
  const { data } = await api.post<TwoBighaClientResyncResult>(`/crm/clients/${clientId}/twobigha-sync`);
  return data;
}

/** Sync-health rollup for the Settings → 2bigha Sync hub (Clients tab). */
export async function fetchTwoBighaClientsSummary(): Promise<TwoBighaClientsSummary> {
  const { data } = await api.get<TwoBighaClientsSummary>("/crm/twobigha/clients-summary");
  return data;
}

export function twobighaClientSyncToastMessage(status?: string): string {
  switch (status) {
    case "synced":
      return "Client synced to 2bigha";
    case "mock":
      return "Client saved · 2bigha sync in mock mode";
    case "skipped":
      return "Client saved locally · add an email to sync to 2bigha";
    case "failed":
      return "Client saved locally · 2bigha sync failed (retry from client detail)";
    default:
      return "Client saved";
  }
}
