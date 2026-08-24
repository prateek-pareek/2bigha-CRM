import api from "@/lib/crm/api";

/**
 * Read-only client for 2bigha's Legal Verification Queue, proxied through
 * this repo's own NestJS backend
 * (`/crm/legal-cases/twobigha/verification-queue/:bucket` →
 * TwoBighaLegalVerificationService.listLegalVerificationQueue). Same
 * boundary as property-listings' backend-api.ts — the frontend never talks
 * to 2bigha directly.
 *
 * This is 2bigha's own property legal-verification status — distinct from
 * this CRM's local legal-case module (`legal-cases-api.ts`) and from the
 * PM-adapter-backed `/crm/legal/verification` workflow
 * (`property-listings/third-party-api.ts`). There is deliberately no
 * verify/reject action here: the handbook documents these two read queries
 * but no confirmed verify/reject mutation.
 */

export type LegalVerificationBucket = "pending" | "verified";

export interface LegalVerificationProperty {
  property: {
    id: string;
    uuid?: string;
    propertyName?: string;
    title?: string;
    description?: string;
    propertyType?: string;
    status?: string;
    price?: number;
    address?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    isVerified?: boolean;
    isActive?: boolean;
    approvalStatus?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  seo?: { slug?: string };
  verification?: {
    isVerified?: boolean;
    verificationMessage?: string;
  };
}

export interface LegalVerificationMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export interface LegalVerificationResult {
  data: LegalVerificationProperty[];
  meta?: LegalVerificationMeta;
}

/**
 * `null` means 2bigha isn't configured on this backend — distinct from a
 * genuinely empty `{ data: [] }` queue.
 */
export async function fetchTwoBighaLegalVerificationQueue(
  bucket: LegalVerificationBucket,
  params: { page?: number; limit?: number; searchTerm?: string } = {},
): Promise<LegalVerificationResult | null> {
  const { data } = await api.get<LegalVerificationResult | null>(
    `/crm/legal-cases/twobigha/verification-queue/${bucket}`,
    { params },
  );
  return data;
}
