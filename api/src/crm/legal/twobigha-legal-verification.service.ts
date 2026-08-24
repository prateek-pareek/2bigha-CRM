import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';
import { PROPERTY_DETAIL_FIELDS } from '../property-listings/twobigha-property.service';

/**
 * 2bigha's Legal Verification Queue — `getPendingVerificationProperties` /
 * `getVerifiedProperties` per the Integration Handbook. Lives in the legal
 * module (not property-listings) because it's a legal-review workflow, same
 * as this CRM's own `LegalCaseService` — even though both queries are typed
 * as property lookups on 2bigha's side.
 *
 * This is 2bigha's own property legal-verification status — distinct from:
 *  - this CRM's local `LegalCase` model (Lead/Contact-linked legal cases,
 *    see LegalCaseService/LegalCaseController), and
 *  - the PM-adapter-backed LegalVerificationReviewPanel / `/crm/legal/verification`
 *    page, which is a subscription-bundled review workflow against mock/PM
 *    data, not this GraphQL queue.
 * Neither of those is touched by this service.
 *
 * Not yet confirmed against a live 2bigha environment (no credentials were
 * configured while this was written) — modeled by analogy with the sibling
 * property-approval-queue queries in TwoBighaPropertyService: same
 * `GetPropertiesInput!` input shape, same `{ data { property, seo }, meta }`
 * list envelope, plus `verification` per row mirrored from the single-item
 * shape `getPropertyBySlug` already returns (`{ isVerified,
 * verificationMessage }`) — the one place in this codebase 2bigha's
 * verification shape is confirmed to exist at all. If either query errors
 * with a GraphQL validation failure (not an auth failure), confirm the
 * actual input/field names via introspection before relying on this.
 *
 * Deliberately read-only: the handbook documents these two queries but no
 * verify/reject mutation, so there is nothing here to action a property —
 * only to review it.
 */
const GET_PENDING_VERIFICATION_PROPERTIES_QUERY = `
  query GetPendingVerificationProperties($input: GetPropertiesInput!) {
    getPendingVerificationProperties(input: $input) {
      data {
        property {
          ${PROPERTY_DETAIL_FIELDS}
        }
        seo {
          slug
        }
        verification {
          isVerified
          verificationMessage
        }
      }
      meta {
        page
        limit
        total
        totalPages
      }
    }
  }
`;

const GET_VERIFIED_PROPERTIES_QUERY = `
  query GetVerifiedProperties($input: GetPropertiesInput!) {
    getVerifiedProperties(input: $input) {
      data {
        property {
          ${PROPERTY_DETAIL_FIELDS}
        }
        seo {
          slug
        }
        verification {
          isVerified
          verificationMessage
        }
      }
      meta {
        page
        limit
        total
        totalPages
      }
    }
  }
`;

export type LegalVerificationBucket = 'pending' | 'verified';

const LEGAL_VERIFICATION_QUERIES: Record<LegalVerificationBucket, { query: string; field: string }> = {
  pending: { query: GET_PENDING_VERIFICATION_PROPERTIES_QUERY, field: 'getPendingVerificationProperties' },
  verified: { query: GET_VERIFIED_PROPERTIES_QUERY, field: 'getVerifiedProperties' },
};

@Injectable()
export class TwoBighaLegalVerificationService {
  private readonly logger = new Logger(TwoBighaLegalVerificationService.name);

  /**
   * Legal Verification Queue read-through — `getPendingVerificationProperties`
   * / `getVerifiedProperties` depending on `bucket`. Returns `null` in mock
   * mode (no host/key/secret configured) rather than fabricating a queue —
   * there's no meaningful mock legal-verification data to invent.
   */
  async listLegalVerificationQueue(
    bucket: LegalVerificationBucket,
    params: { page?: number; limit?: number; searchTerm?: string },
  ): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    const config = getTwoBighaConfig();
    if (!config) return null;

    const { query, field } = LEGAL_VERIFICATION_QUERIES[bucket];
    try {
      const data = await twoBighaGraphqlRequest<
        Record<string, { data?: Record<string, unknown>[]; meta?: Record<string, unknown> } | null>
      >(config, query, {
        input: {
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          searchTerm: params.searchTerm || undefined,
        },
      });
      const result = data?.[field];
      return {
        data: result?.data || [],
        meta: result?.meta,
      };
    } catch (e: any) {
      this.logger.error(`2bigha ${field} failed: ${e?.message}`);
      return null;
    }
  }
}
