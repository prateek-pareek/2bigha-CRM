import api from "@/lib/crm/api";

/**
 * Read-only client for 2bigha's Property Approval Queue, proxied through
 * this repo's own NestJS backend (`/crm/property-listings/twobigha/approval-queue/:bucket`
 * → TwoBighaPropertyService.listApprovalQueue), same boundary as
 * backend-api.ts — the frontend never talks to 2bigha directly.
 *
 * There is deliberately no approve/reject action here: the Integration
 * Handbook documents these three read queries but no confirmed
 * approve/reject mutation, so this only backs a review screen.
 */

export type ApprovalQueueBucket = "pending" | "approved" | "rejected";

/** A single row's shape — the `properties` composite envelope (property fields + seo.slug), per PROPERTY_DETAIL_FIELDS on the backend. */
export interface ApprovalQueueProperty {
  property: {
    id: string;
    uuid?: string;
    propertyName?: string;
    title?: string;
    description?: string;
    propertyType?: string;
    status?: string;
    price?: number;
    pricePerUnit?: string;
    area?: string;
    areaUnit?: string;
    address?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    pinCode?: string;
    isVerified?: boolean;
    isActive?: boolean;
    isFeatured?: boolean;
    approvalStatus?: string;
    approvalMessage?: string;
    createdAt?: string;
    updatedAt?: string;
    publishedAt?: string;
    // No `images` field here — the backend query deliberately omits it; see
    // the comment on PROPERTY_DETAIL_FIELDS in twobigha-property.service.ts.
  };
  seo?: { slug?: string };
}

export interface ApprovalQueueMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface ApprovalQueueResult {
  data: ApprovalQueueProperty[];
  meta?: ApprovalQueueMeta;
}

/**
 * `null` means 2bigha isn't configured on this backend (TWOBIGHA_API_HOST/
 * KEY/SECRET missing, or TWOBIGHA_USE_MOCK=true) — distinct from a
 * genuinely empty `{ data: [] }` queue.
 */
export async function fetchApprovalQueue(
  bucket: ApprovalQueueBucket,
  params: { page?: number; limit?: number; searchTerm?: string } = {},
): Promise<ApprovalQueueResult | null> {
  const { data } = await api.get<ApprovalQueueResult | null>(
    `/crm/property-listings/twobigha/approval-queue/${bucket}`,
    { params },
  );
  return data;
}

export async function decidePropertyApproval(params: {
  id: string;
  status: "Approved" | "Rejected";
  message?: string;
}): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>(
    "/crm/property-listings/approval-decision",
    params,
  );
  return data;
}
