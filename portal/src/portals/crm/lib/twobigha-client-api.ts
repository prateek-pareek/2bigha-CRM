import api from "@/lib/crm/api";

/**
 * 2Bigha Client Live Data API client (proxied via NestJS /api/crm/clients/:id/twobigha-*).
 * All 6 live GraphQL queries tested and integrated:
 * 1. getClientMetaData
 * 2. getPropertiesByClientId
 * 3. getClientInvoices
 * 4. getClientBillingAndUsageSummary
 * 5. getClientFeatureRequests
 * 6. getManagedPropertiesByClientId
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

// ── 1. Client Meta Data ───────────────────────────────────────────────────────
export interface ClientListingCounts {
  total?: number;
  pending?: number;
  approved?: number;
  rejected?: number;
  sold?: number;
}

export interface ClientMetaDataSubscription {
  planName?: string;
  billingCycle?: string;
  price?: string;
  status?: string;
  expiresAt?: string;
}

export interface ClientMetaDataClient {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  avatar?: string;
  address?: string;
}

export interface ClientMetaDataResponse {
  client?: ClientMetaDataClient | null;
  property?: ClientListingCounts;
  farm?: ClientListingCounts;
  subscription?: ClientMetaDataSubscription | null;
  message?: string;
  STATUS_CODES?: number;
}

// ── 2. Properties By Client ID ────────────────────────────────────────────────
export interface LeadPropertyImageVariants {
  thumbnail?: string;
  medium?: string;
  large?: string;
  original?: string;
}

export interface LeadPropertyImage {
  id?: string;
  url?: string;
  variants?: LeadPropertyImageVariants;
  caption?: string;
  sortOrder?: number;
  isFeatured?: boolean;
}

export interface LeadProperty {
  id: string;
  title?: string;
  description?: string;
  propertyType?: string;
  status?: string;
  approvalStatus?: string;
  listingType?: string;
  price?: number;
  pricePerUnit?: number;
  area?: number;
  areaUnit?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  pinCode?: string;
  khasraNumber?: string;
  listingAs?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerWhatsapp?: string;
  isFeatured?: boolean;
  isVerified?: boolean;
  availablilityStatus?: string;
  viewCount?: number;
  inquiryCount?: number;
  createdAt?: string;
  publishedAt?: string;
  createdByName?: string;
  clientName?: string;
  clientPhone?: string;
  createdByUserName?: string;
  images?: LeadPropertyImage[];
}

export interface LeadPropertyCounts {
  all?: number;
  pending?: number;
  approved?: number;
  rejected?: number;
  flagged?: number;
}

export interface LeadPropertiesResponse {
  result?: LeadProperty[];
  totalCount?: number;
  counts?: LeadPropertyCounts;
  message?: string;
  STATUS_CODES?: number;
}

// ── 3. Client Invoices ───────────────────────────────────────────────────────
export interface LeadInvoiceFeature {
  featureKey?: string;
  featureValue?: string;
  displayText?: string;
}

export interface LeadInvoice {
  id?: number;
  invoiceNumber?: string;
  planName?: string;
  billingCycle?: string;
  baseAmount?: number;
  discountAmount?: number;
  netAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
  gstPercent?: number;
  paymentType?: string;
  paymentMethod?: string;
  razorpayPaymentId?: string;
  startsAt?: string;
  expiresAt?: string;
  issuedAt?: string;
  subscriptionId?: number;
  features?: LeadInvoiceFeature[];
}

export interface LeadInvoicesResponse {
  result?: LeadInvoice[];
  totalCount?: number;
  message?: string;
  STATUS_CODES?: number;
}

// ── 4. Client Usage & Billing Summary ─────────────────────────────────────────
export interface FeatureUsage {
  used: number;
  allowed: number;
  remaining: number;
}

export interface FirstPageVisibilityStatus {
  included: boolean;
  durationType?: string;
  allowed?: number;
  used?: number;
  remaining?: number;
  activeCount?: number;
}

export interface UsageSummary {
  planName?: string;
  planTier?: number;
  expiresAt?: string;
  listings?: FeatureUsage;
  featuredListings?: FeatureUsage;
  socialMarketingPosts?: FeatureUsage;
  propertyCount?: FeatureUsage;
  firstPageVisibility?: FirstPageVisibilityStatus;
}

// ── 5. Client Feature Requests ───────────────────────────────────────────────
export interface LeadStatusFeatured {
  id?: number;
  propertyId?: string;
  propertyTitle?: string;
  status?: string;
  approvalStatus?: string;
  adminNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadStatusSocialMedia {
  id?: number;
  propertyId?: string;
  propertyTitle?: string;
  status?: string;
  assignedTo?: string;
  videoLink?: string;
  estimatedAt?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface LeadStatusLegal {
  id?: number;
  propertyId?: string;
  propertyTitle?: string;
  status?: string;
  adminNotes?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  hasReport?: boolean;
  reportFileName?: string;
  reportUploadedAt?: string;
  createdAt?: string;
}

export interface LeadStatusResponse {
  featured?: LeadStatusFeatured[];
  socialMedia?: LeadStatusSocialMedia[];
  legal?: LeadStatusLegal[];
  message?: string;
  STATUS_CODES?: number;
}

// ── 6. Managed Properties (PM) ────────────────────────────────────────────────
export interface PMManagedProperty {
  id?: string;
  title?: string;
  propertyName?: string;
  propertyType?: string;
  price?: number;
  area?: number;
  areaUnit?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  khasraNumber?: string;
  status?: string;
  approvalStatus?: string;
  availabilityStatus?: string;
}

export interface PMPlanDetails {
  id?: string;
  planName?: string;
  description?: string;
  billingCycle?: string;
  durationInDays?: number;
  visitsAllowed?: number;
  pricePerVisit?: number;
}

export interface PMPropertyVisit {
  id?: string;
  visitDate?: string;
  status?: string;
  agentName?: string;
}

export interface PMUserProperty {
  userPropertyId: string;
  visitsRemaining?: number;
  visitsUsed?: number;
  assignmentStatus?: string;
  property?: PMManagedProperty;
  planDetails?: PMPlanDetails;
  visits?: PMPropertyVisit[];
}

export interface PMUserPropertyResult {
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  data?: PMUserProperty[];
}

// ── API Functions ────────────────────────────────────────────────────────────

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

/** 1. Fetch Client Meta Data Header & Counts (`getClientMetaData`) */
export async function fetchTwoBighaClientMetaData(clientId: string): Promise<ClientMetaDataResponse> {
  const { data } = await api.get<ClientMetaDataResponse>(`/crm/clients/${clientId}/twobigha-metadata`);
  return data;
}

/** 2. Fetch Client Properties & Counts (`getPropertiesByClientId`) */
export async function fetchTwoBighaClientProperties(
  clientId: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    propertyCategory?: string;
    approvalStatus?: string;
    createdBy?: string;
  } = {},
): Promise<LeadPropertiesResponse> {
  const { data } = await api.get<LeadPropertiesResponse>(`/crm/clients/${clientId}/twobigha-properties`, {
    params,
  });
  return data;
}

/** 2b. Fetch All 2Bigha Properties (Admin Global Listing) */
export async function fetchTwoBighaAllProperties(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    propertyCategory?: string;
    approvalStatus?: string;
    createdBy?: string;
  } = {},
): Promise<LeadPropertiesResponse> {
  const { data } = await api.get<LeadPropertiesResponse>("/crm/twobigha/properties", {
    params,
  });
  return data;
}

/** 3. Fetch Client Invoices (`getClientInvoices`) */
export async function fetchTwoBighaClientInvoices(clientId: string): Promise<LeadInvoicesResponse> {
  const { data } = await api.get<LeadInvoicesResponse>(`/crm/clients/${clientId}/twobigha-invoices`);
  return data;
}

/** 4. Fetch Client Billing & Usage Summary (`getClientBillingAndUsageSummary`) */
export async function fetchTwoBighaClientUsage(clientId: string): Promise<UsageSummary | null> {
  const { data } = await api.get<UsageSummary | null>(`/crm/clients/${clientId}/twobigha-usage`);
  return data;
}

/** 5. Fetch Client Feature Requests Board (`getClientFeatureRequests`) */
export async function fetchTwoBighaClientFeatureRequests(clientId: string): Promise<LeadStatusResponse> {
  const { data } = await api.get<LeadStatusResponse>(`/crm/clients/${clientId}/twobigha-feature-requests`);
  return data;
}

/** 6. Fetch Client Managed Properties (`getManagedPropertiesByClientId`) */
export async function fetchTwoBighaClientManagedProperties(
  clientId: string,
  params: { page?: number; limit?: number } = {},
): Promise<PMUserPropertyResult> {
  const { data } = await api.get<PMUserPropertyResult>(`/crm/clients/${clientId}/twobigha-managed-properties`, {
    params,
  });
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
