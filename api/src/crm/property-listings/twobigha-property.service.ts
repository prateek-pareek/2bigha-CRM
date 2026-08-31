import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

/**
 * 2bigha's Property API is served entirely from one GraphQL endpoint
 * (`${TWOBIGHA_API_HOST}/graphql`) — see the 2bigha API Integration
 * Handbook. This service covers exactly the slice that PropertyListingsService
 * needs: create/update a property in 2bigha whenever one is added or edited
 * on a Lead in the CRM, so 2bigha stays the source of record for property
 * data while the CRM stays the source of record for the lead.
 *
 * Low-level config/request plumbing lives in shared/twobigha-graphql.util —
 * see that file for the env-var contract and mock-mode fallback rules.
 */

/** The subset of PropertyListing fields this service needs — kept narrow so callers don't have to pass a full Mongoose document. */
export interface PropertyListingSyncInput {
  _id: string;
  title: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  price: number;
  propertyType?: string;
  areaSqft?: number;
  description?: string;
  status?: string;
  contactName?: string;
  contactPhone?: string;
  /** Already-hosted image URLs on the listing — re-uploaded to 2bigha's own Azure Blob storage on first sync (see uploadPropertyImages). */
  images?: string[];
  /** Existing 2bigha id, if this listing has synced before — presence routes to updateProperty instead of createProperty. */
  twobighaPropertyId?: string;
}

export interface TwoBighaSyncResult {
  /** 'unsupported' = farm-specific: 2bigha has no general farm-update mutation, so the edit wasn't pushed — see syncFarmUpdate. */
  status: 'synced' | 'mock' | 'failed' | 'unsupported';
  twobighaPropertyId?: string;
  error?: string;
  syncedAt: Date;
  /** Full property detail as returned by 2bigha (see PROPERTY_DETAIL_FIELDS) — absent for mock/failed/unsupported results. */
  detail?: Record<string, unknown>;
}

/**
 * CRM `PropertyListingType` → 2bigha `PropertyType`. Per the Integration
 * Handbook, `PropertyType` is declared twice in 2bigha's SDL with different
 * value sets and "a single SDL string literally defining enum PropertyType
 * twice... is not valid GraphQL as written" — the handbook could not confirm
 * from source which set is live and recommends confirming via introspection.
 * This maps onto the larger of the two declared sets (the handbook's best
 * guess at what's actually accepted); reconfirm before relying on it.
 */
const PROPERTY_TYPE_MAP: Record<string, string> = {
  Apartment: 'APARTMENT',
  Villa: 'VILLA',
  'Independent House': 'RESIDENTIAL',
  Plot: 'PLOT',
  Commercial: 'COMMERCIAL',
  Office: 'OFFICE',
  Warehouse: 'WAREHOUSE',
  Agricultural: 'AGRICULTURAL',
  Residential: 'RESIDENTIAL',
  Industrial: 'INDUSTRIAL',
  Farmhouse: 'FARMHOUSE',
  Farmland: 'FARMLAND',
  Other: 'OTHER',
  // 'Farm' deliberately has no entry: Farm-typed listings never reach
  // buildPropertyInput — PropertyListingsService routes them to
  // buildFarmInput/createFarmByAdmin (2bigha's separate Farm API) instead.
};

/**
 * Representative subset of the documented `Property!` response shape (the
 * handbook lists several dozen fields — the doc itself notes some, like
 * `location`/`boundary`/`geoJson`, are free-form JSON best fetched only when
 * actually needed). Shared by create/update/getPropertyBySlug/approval-queue
 * so every read of a 2bigha property returns the same detail shape for
 * display.
 *
 * Deliberately does NOT request `images` — confirmed live against 2bigha
 * that any property with no photos crashes the *entire* query with
 * "Cannot return null for non-nullable field Property.images"
 * (2bigha declares `images` non-null but its own resolver returns null for
 * a photo-less property, which GraphQL propagates as a hard field error,
 * not just a null `images`). Since that's unfixable from the query side,
 * images are left out of every operation sharing this fragment; fetch them
 * per-property via `getPropertyMedia` instead once that's wired up (see the
 * "Property media management" gap in the integration priority list).
 */
export const PROPERTY_DETAIL_FIELDS = `
  id
  uuid
  propertyName
  title
  description
  propertyType
  status
  price
  pricePerUnit
  area
  areaUnit
  address
  city
  district
  state
  country
  pinCode
  latLng
  availablilityStatus
  isVerified
  isActive
  isFeatured
  approvalStatus
  approvalMessage
  createdAt
  updatedAt
  publishedAt
`;

const CREATE_PROPERTY_MUTATION = `
  mutation CreateProperty($input: CreatePropertyInput!) {
    createProperty(input: $input) {
      ${PROPERTY_DETAIL_FIELDS}
    }
  }
`;

const UPDATE_PROPERTY_MUTATION = `
  mutation UpdateProperty($id: ID!, $input: UpdatePropertyInput!) {
    updateProperty(id: $id, input: $input) {
      ${PROPERTY_DETAIL_FIELDS}
    }
  }
`;

/**
 * `getPropertyBySlug` — the handbook's own words: "the operation to use for
 * a property-detail display screen." Response is the `properties` composite
 * envelope (lower-case, distinct from the bare `Property` create/update
 * return above): the property fields nested under `property`, plus SEO
 * (incl. the slug) and legal-verification status alongside it.
 */
const GET_PROPERTY_BY_SLUG_QUERY = `
  query GetPropertyBySlug($input: inputGetPropertyBySlug!) {
    getPropertyBySlug(input: $input) {
      property {
        ${PROPERTY_DETAIL_FIELDS}
      }
      seo {
        slug
        seoTitle
        seoDescription
      }
      verification {
        isVerified
        verificationMessage
      }
    }
  }
`;

const GET_PROPERTIES_QUERY = `
  query GetProperties($input: GetPropertiesInput!) {
    properties(input: $input) {
      data {
        property {
          ${PROPERTY_DETAIL_FIELDS}
        }
        seo {
          slug
        }
        images {
          variants {
            thumbnail
          }
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

/**
 * Step 1 of the property image-upload flow (per the handbook): request
 * pre-signed Azure Blob upload URLs, one per image, before create/update.
 * `count` is silently clamped server-side to [1, 10].
 */
const GET_PROPERTY_IMAGE_UPLOAD_URLS_QUERY = `
  query GetPropertyImageUploadUrls($count: Int!) {
    getPropertyImageUploadUrls(count: $count) {
      uploadUrl
      blobPath
    }
  }
`;

/**
 * Lean detail subset for the Farm domain's own `Property` type — per the
 * handbook's Shared Types section, farm's declaration makes nearly
 * everything nullable, adds `source`, and drops pinCode/viewCount/
 * inquiryCount/khasra-murabba-khewat entirely versus the Property domain's
 * type of the same name. Kept intentionally smaller than
 * PROPERTY_DETAIL_FIELDS to only request fields the handbook confirms exist
 * on both declarations.
 */
const FARM_DETAIL_FIELDS = `
  id
  propertyName
  title
  description
  propertyType
  status
  price
  area
  areaUnit
  address
  city
  district
  state
  country
  source
  isVerified
  isActive
  createdAt
  updatedAt
`;

/**
 * `getFarms` — the primary farm search/listing query per the handbook.
 * NOTE: the handbook documents this query's input fields
 * (userId/page/limit/searchTerm/approvalstatus) but not its exact GraphQL
 * argument name — written here as `input: GetFarmsInput!` by analogy with
 * the Property domain's `properties(input: GetPropertiesInput!)`; confirm
 * via introspection if this errors with a validation (not auth) failure.
 */
const GET_FARMS_QUERY = `
  query GetFarms($input: GetFarmsInput!) {
    getFarms(input: $input) {
      data {
        property {
          ${FARM_DETAIL_FIELDS}
        }
        seo {
          slug
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

/**
 * `getFarmBySlug` — the farm-detail display operation. The handbook flags
 * that the outer `input` argument is NOT marked non-null in 2bigha's SDL and
 * that omitting it throws a runtime error rather than a clean GraphQL
 * validation error — always pass `input`, as done here.
 */
const GET_FARM_BY_SLUG_QUERY = `
  query GetFarmBySlug($input: inputGetFarmBySlug) {
    getFarmBySlug(input: $input) {
      property {
        ${FARM_DETAIL_FIELDS}
      }
      seo {
        slug
      }
    }
  }
`;

/**
 * Farm create response is the `Properties` composite envelope (capital-P,
 * distinct from the lower-case `properties` used by the Property domain) —
 * the id lives at `property.id`, not the mutation's top level.
 */
const CREATE_FARM_MUTATION = `
  mutation CreateFarm($input: CreateFarmsInput!) {
    createFarmByAdmin(input: $input) {
      property {
        id
        status
      }
    }
  }
`;

/**
 * Property Approval Queue — per the Integration Handbook's list of
 * approval-related read operations. None confirmed against a live 2bigha
 * environment yet (no credentials were configured while this was written)
 * — modeled by analogy with the sibling `getFarms` query above: same
 * `GetPropertiesInput!` input shape the handbook attributes to the Property
 * domain's `properties` query (page/limit/searchTerm), same
 * `{ data { property, seo }, meta }` list envelope. If any of these three
 * errors with a GraphQL validation failure (not an auth failure), confirm
 * the actual input/field names via introspection before relying on this.
 *
 * Deliberately read-only: the handbook documents these three queries but no
 * approve/reject mutation, so there is nothing here to action a listing —
 * only to review it.
 */
const GET_PENDING_APPROVAL_PROPERTIES_QUERY = `
  query GetPendingApprovalProperties($input: GetPropertiesInput!) {
    getPendingApprovalProperties(input: $input) {
      data {
        property {
          ${PROPERTY_DETAIL_FIELDS}
        }
        seo {
          slug
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

const GET_APPROVED_PROPERTIES_QUERY = `
  query GetApprovedProperties($input: GetPropertiesInput!) {
    getApprovedProperties(input: $input) {
      data {
        property {
          ${PROPERTY_DETAIL_FIELDS}
        }
        seo {
          slug
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

const GET_REJECTED_PROPERTIES_QUERY = `
  query GetRejectedProperties($input: GetPropertiesInput!) {
    getRejectedProperties(input: $input) {
      data {
        property {
          ${PROPERTY_DETAIL_FIELDS}
        }
        seo {
          slug
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

export type ApprovalQueueBucket = 'pending' | 'approved' | 'rejected';

const APPROVAL_QUEUE_QUERIES: Record<ApprovalQueueBucket, { query: string; field: string }> = {
  pending: { query: GET_PENDING_APPROVAL_PROPERTIES_QUERY, field: 'getPendingApprovalProperties' },
  approved: { query: GET_APPROVED_PROPERTIES_QUERY, field: 'getApprovedProperties' },
  rejected: { query: GET_REJECTED_PROPERTIES_QUERY, field: 'getRejectedProperties' },
};

@Injectable()
export class TwoBighaPropertyService {
  private readonly logger = new Logger(TwoBighaPropertyService.name);

  /**
   * `CreatePropertyInput`/`UpdatePropertyInput` share the same nested shape
   * per the handbook, so both mutations reuse this builder. `blobPaths` —
   * already-uploaded 2bigha blob paths (see uploadPropertyImages) — go
   * straight into `images: [String!]` as documented; property images are
   * plain blob-path strings, not a GraphQL Upload.
   */
  private buildPropertyInput(
    listing: PropertyListingSyncInput,
    blobPaths?: string[],
  ): Record<string, unknown> {
    const areaUnit = listing.areaSqft != null ? 'SQFT' : undefined; // AreaUnit is also declared twice in 2bigha's SDL (SQFT vs SQUARE_FEET) — confirm via introspection before relying on this.
    return {
      location: {
        state: listing.state || undefined,
        city: listing.city || undefined,
        pincode: listing.zipCode || undefined,
        address: listing.address || undefined,
        name: listing.title || undefined,
      },
      propertyDetailsSchema: {
        propertyType: listing.propertyType
          ? PROPERTY_TYPE_MAP[listing.propertyType] || 'OTHER'
          : undefined,
        // khasraNumber/totalPrice/area etc. are typed String in 2bigha's schema, not numeric scalars — sent as strings intentionally.
        area: listing.areaSqft != null ? String(listing.areaSqft) : undefined,
        areaUnit,
        totalPrice: listing.price != null ? String(listing.price) : undefined,
        description: listing.description || undefined,
      },
      contactDetails: {
        ownerName: listing.contactName || undefined,
        phoneNumber: listing.contactPhone || undefined,
      },
      images: blobPaths?.length ? blobPaths : undefined,
    };
  }

  /**
   * Property image-upload flow, per the handbook: request one pre-signed
   * Azure Blob upload URL per image (clamped to 10), fetch each already-
   * hosted image's bytes, PUT them to the upload URL, and return the
   * blobPath values 2bigha's `images: [String!]` field expects. Images that
   * fail to fetch/upload are skipped rather than aborting the whole sync —
   * a partial photo set beats none. `x-ms-blob-type: BlockBlob` is standard
   * for an Azure SAS block-blob PUT, not something the handbook states
   * explicitly; confirm with the backend team if uploads 400.
   */
  private async uploadPropertyImages(
    config: ReturnType<typeof getTwoBighaConfig>,
    imageUrls: string[],
  ): Promise<string[]> {
    if (!config || !imageUrls.length) return [];
    const wanted = Math.min(imageUrls.length, 10);
    let slots: Array<{ uploadUrl: string; blobPath: string }> = [];
    try {
      const data = await twoBighaGraphqlRequest<{
        getPropertyImageUploadUrls?: Array<{ uploadUrl: string; blobPath: string }>;
      }>(config, GET_PROPERTY_IMAGE_UPLOAD_URLS_QUERY, { count: wanted });
      slots = data?.getPropertyImageUploadUrls || [];
    } catch (e: any) {
      this.logger.warn(`2bigha getPropertyImageUploadUrls failed: ${e?.message}`);
      return [];
    }

    const blobPaths: string[] = [];
    for (let i = 0; i < Math.min(slots.length, imageUrls.length); i++) {
      const { uploadUrl, blobPath } = slots[i];
      try {
        const imgRes = await fetch(imageUrls[i]);
        if (!imgRes.ok) continue;
        const bytes = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get('content-type') || 'application/octet-stream';
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
          body: bytes,
        });
        if (putRes.ok) blobPaths.push(blobPath);
        else this.logger.warn(`2bigha blob upload PUT failed (${putRes.status}) for ${imageUrls[i]}`);
      } catch (e: any) {
        this.logger.warn(`Skipping image ${imageUrls[i]} — fetch/upload failed: ${e?.message}`);
      }
    }
    return blobPaths;
  }

  /**
   * `CreateFarmsInput` — a materially different shape from Property's, per
   * the handbook: `location` has no pincode/name/placeId, `contactDetails`
   * uses `listingAs`/`alternativePhone` instead of `listerType`/`ownerId`,
   * and — the one easy-to-miss gotcha — `farmDetailsSchema.price` is a
   * `Float`, unlike Property's `totalPrice: String`. Images are typed
   * `[Upload!]` (GraphQL multipart) rather than blob-path strings, so they're
   * intentionally omitted here; sending farm photos to 2bigha needs a
   * separate multipart client, out of scope for this pass.
   */
  private buildFarmInput(listing: PropertyListingSyncInput): Record<string, unknown> {
    return {
      location: {
        state: listing.state || undefined,
        city: listing.city || undefined,
        address: listing.address || undefined,
      },
      farmDetailsSchema: {
        propertyName: listing.title || undefined,
        propertyType: 'FARMLAND',
        area: listing.areaSqft != null ? String(listing.areaSqft) : undefined,
        areaUnit: listing.areaSqft != null ? 'SQFT' : undefined, // see the AreaUnit caveat on buildPropertyInput above
        price: listing.price, // Float, not String — do not stringify like Property's totalPrice
        description: listing.description || undefined,
      },
      contactDetails: {
        ownerName: listing.contactName || undefined,
        phoneNumber: listing.contactPhone || undefined,
      },
    };
  }

  private mockResult(listing: PropertyListingSyncInput): TwoBighaSyncResult {
    return {
      status: 'mock',
      twobighaPropertyId: listing.twobighaPropertyId || `mock-2b-${listing._id}`,
      syncedAt: new Date(),
    };
  }

  /** Create the property in 2bigha (createProperty) — used the first time a listing syncs. */
  async syncPropertyCreate(listing: PropertyListingSyncInput): Promise<TwoBighaSyncResult> {
    const config = getTwoBighaConfig();
    if (!config) return this.mockResult(listing);

    // Only uploaded on the initial create — see syncPropertyUpdate for why
    // edits don't re-upload/diff images against what's already on 2bigha.
    const blobPaths = listing.images?.length
      ? await this.uploadPropertyImages(config, listing.images)
      : undefined;

    try {
      const data = await twoBighaGraphqlRequest<{
        createProperty?: { id?: string } & Record<string, unknown>;
      }>(config, CREATE_PROPERTY_MUTATION, {
        input: this.buildPropertyInput(listing, blobPaths),
      });
      const detail = data?.createProperty;
      const id = detail?.id;
      if (!id) throw new Error('2bigha did not return a property id');
      return {
        status: 'synced',
        twobighaPropertyId: String(id),
        syncedAt: new Date(),
        detail,
      };
    } catch (e: any) {
      this.logger.error(
        `2bigha createProperty failed for listing ${listing._id}: ${e?.message}`,
      );
      return {
        status: 'failed',
        error: e?.message || 'Unknown error',
        syncedAt: new Date(),
      };
    }
  }

  /**
   * Push an edit back to 2bigha (updateProperty) — falls back to create if
   * this listing never synced before. Deliberately does NOT re-upload or
   * diff `images` on every edit — 2bigha's `images` field is an opaque
   * blob-path list with no reported diffing endpoint here (only
   * addPropertyImages/removePropertyImage, out of scope for this pass), so
   * re-sending on every save would either be a no-op or risk duplicating
   * images depending on how the resolver treats the field. Leaving it unset
   * means an update never touches whatever images the initial create sent.
   */
  async syncPropertyUpdate(listing: PropertyListingSyncInput): Promise<TwoBighaSyncResult> {
    if (!listing.twobighaPropertyId) {
      return this.syncPropertyCreate(listing);
    }
    const config = getTwoBighaConfig();
    if (!config) return this.mockResult(listing);

    try {
      const data = await twoBighaGraphqlRequest<{
        updateProperty?: ({ id?: string } & Record<string, unknown>) | null;
      }>(config, UPDATE_PROPERTY_MUTATION, {
        id: listing.twobighaPropertyId,
        input: this.buildPropertyInput(listing),
      });
      // updateProperty's response is nullable per the handbook (unlike createProperty's `Property!`) — fall back to what we already had if 2bigha returns null.
      return {
        status: 'synced',
        twobighaPropertyId: listing.twobighaPropertyId,
        syncedAt: new Date(),
        detail: data?.updateProperty ?? undefined,
      };
    } catch (e: any) {
      this.logger.error(
        `2bigha updateProperty failed for listing ${listing._id}: ${e?.message}`,
      );
      return {
        status: 'failed',
        error: e?.message || 'Unknown error',
        syncedAt: new Date(),
      };
    }
  }

  /** Create a farm listing in 2bigha (createFarmByAdmin) — used the first time a Farm-typed listing syncs. */
  async syncFarmCreate(listing: PropertyListingSyncInput): Promise<TwoBighaSyncResult> {
    const config = getTwoBighaConfig();
    if (!config) return this.mockResult(listing);

    try {
      const data = await twoBighaGraphqlRequest<{
        createFarmByAdmin?: { property?: ({ id?: string } & Record<string, unknown>) | null };
      }>(config, CREATE_FARM_MUTATION, { input: this.buildFarmInput(listing) });
      const detail = data?.createFarmByAdmin?.property;
      const id = detail?.id;
      if (!id) throw new Error('2bigha did not return a farm id');
      return {
        status: 'synced',
        twobighaPropertyId: String(id),
        syncedAt: new Date(),
        detail: detail ?? undefined,
      };
    } catch (e: any) {
      this.logger.error(
        `2bigha createFarmByAdmin failed for listing ${listing._id}: ${e?.message}`,
      );
      return {
        status: 'failed',
        error: e?.message || 'Unknown error',
        syncedAt: new Date(),
      };
    }
  }

  /**
   * 2bigha has no general farm-update mutation live — only `updateFarmSeo`
   * (SEO fields only); a fully-fleshed `UpdateFarmInput` type exists in the
   * schema but nothing currently accepts it (see the handbook's "Known
   * Gaps"). Reported as 'unsupported' rather than silently no-op'd or
   * mis-reported as a transport 'failed', so it's visibly distinct in
   * `twobighaSyncError` from an actual API/network error.
   */
  async syncFarmUpdate(listing: PropertyListingSyncInput): Promise<TwoBighaSyncResult> {
    if (!listing.twobighaPropertyId) {
      return this.syncFarmCreate(listing);
    }
    return {
      status: 'unsupported',
      twobighaPropertyId: listing.twobighaPropertyId,
      error:
        '2bigha has no general farm-update API (only SEO fields can be patched via updateFarmSeo) — this edit was not pushed to 2bigha. See "Known Gaps" in the Integration Handbook.',
      syncedAt: new Date(),
    };
  }

  /**
   * `getPropertyBySlug` — a live, on-demand read of 2bigha's canonical
   * property-detail view (per the handbook, "the operation to use for a
   * property-detail display screen"). Public/unauthenticated per the
   * handbook, but a host still needs to be configured to reach it — returns
   * `null` in mock mode (there's no meaningful mock detail to fabricate for
   * an arbitrary slug the CRM didn't create) rather than a fake payload.
   */
  async getPropertyDetailBySlug(slug: string): Promise<Record<string, unknown> | null> {
    const config = getTwoBighaConfig();
    if (!config) return null;

    try {
      const data = await twoBighaGraphqlRequest<{
        getPropertyBySlug?: Record<string, unknown> | null;
      }>(config, GET_PROPERTY_BY_SLUG_QUERY, { input: { slug } });
      return data?.getPropertyBySlug ?? null;
    } catch (e: any) {
      this.logger.error(`2bigha getPropertyBySlug failed for slug "${slug}": ${e?.message}`);
      return null;
    }
  }

  /** `getFarmBySlug` — the farm-detail display operation, mirroring getPropertyDetailBySlug above. */
  async getFarmDetailBySlug(slug: string): Promise<Record<string, unknown> | null> {
    const config = getTwoBighaConfig();
    if (!config) return null;

    try {
      const data = await twoBighaGraphqlRequest<{
        getFarmBySlug?: Record<string, unknown> | null;
      }>(config, GET_FARM_BY_SLUG_QUERY, { input: { slug } });
      const farm = data?.getFarmBySlug;
      if (!farm) return null;

      const propertyId = (farm.property as any)?.id;
      if (propertyId) {
        try {
          const media = await twoBighaGraphqlRequest<{
            getPropertyMedia?: { images?: { thumbnailUrl: string }[] };
          }>(config, `
            query GetPropertyMedia($propertyId: ID!) {
              getPropertyMedia(propertyId: $propertyId) {
                images {
                  thumbnailUrl
                }
              }
            }
          `, { propertyId });
          const urls = media?.getPropertyMedia?.images?.map((img) => img.thumbnailUrl) || [];
          (farm.property as any).images = urls;
        } catch {}
      }
      return farm;
    } catch (e: any) {
      this.logger.error(`2bigha getFarmBySlug failed for slug "${slug}": ${e?.message}`);
      return null;
    }
  }

  /**
   * `getFarms` — farm search/listing, the primary way to pull farm data
   * back from 2bigha for display. Public/unauthenticated per the handbook,
   * but still needs a configured host — returns `null` in mock mode rather
   * than fabricating a farm list that doesn't correspond to anything real.
   */
  async listFarms(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
  }): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    const config = getTwoBighaConfig();
    if (!config) return null;

    try {
      const data = await twoBighaGraphqlRequest<{
        getFarms?: { data?: Record<string, unknown>[]; meta?: Record<string, unknown> } | null;
      }>(config, GET_FARMS_QUERY, {
        input: {
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          searchTerm: params.searchTerm || undefined,
        },
      });

      return {
        data: data?.getFarms?.data || [],
        meta: data?.getFarms?.meta,
      };
    } catch (e: any) {
      this.logger.error(`2bigha getFarms failed: ${e?.message}`);
      return null;
    }
  }

  /**
   * Property Approval Queue read-through — `getPendingApprovalProperties` /
   * `getApprovedProperties` / `getRejectedProperties` depending on `bucket`.
   * Read-only review data; see the module-level comment above
   * APPROVAL_QUEUE_QUERIES for the "no approve/reject mutation" caveat.
   * Returns `null` in mock mode, same as listFarms/getPropertyDetailBySlug —
   * there's no meaningful mock queue to fabricate.
   */
  async listApprovalQueue(
    bucket: ApprovalQueueBucket,
    params: { page?: number; limit?: number; searchTerm?: string },
  ): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    const config = getTwoBighaConfig();
    if (!config) return null;

    const { query, field } = APPROVAL_QUEUE_QUERIES[bucket];
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

  /** getPropertyMediaBySlug — fetch the images for a farm or standard property by its slug. */
  async getPropertyMediaBySlug(slug: string): Promise<string[]> {
    const config = getTwoBighaConfig();
    if (!config) return [];
    try {
      // Try to get standard property ID first
      let data = await twoBighaGraphqlRequest<{
        getPropertyBySlug?: { property?: { id?: string } | null } | null;
      }>(config, GET_PROPERTY_BY_SLUG_QUERY, { input: { slug } }).catch(() => null);
      
      let propertyId = data?.getPropertyBySlug?.property?.id;
      
      if (!propertyId) {
        // Fallback to farm ID
        const farmData = await twoBighaGraphqlRequest<{
          getFarmBySlug?: { property?: { id?: string } | null } | null;
        }>(config, GET_FARM_BY_SLUG_QUERY, { input: { slug } }).catch(() => null);
        propertyId = farmData?.getFarmBySlug?.property?.id;
      }
      
      if (!propertyId) return [];

      const media = await twoBighaGraphqlRequest<{
        getPropertyMedia?: { images?: { thumbnailUrl: string }[] };
      }>(config, `
        query GetPropertyMedia($propertyId: ID!) {
          getPropertyMedia(propertyId: $propertyId) {
            images {
              thumbnailUrl
            }
          }
        }
      `, { propertyId });
      return media?.getPropertyMedia?.images?.map((img) => img.thumbnailUrl) || [];
    } catch (e: any) {
      this.logger.error(`2bigha getPropertyMediaBySlug failed for slug "${slug}": ${e?.message}`);
      return [];
    }
  }

  /** `properties` — standard properties search/listing, pulling live data from 2bigha GraphQL for display. */
  async listProperties(params: {
    page?: number;
    limit?: number;
    searchTerm?: string;
    status?: string;
  }): Promise<{ data: Record<string, unknown>[]; meta?: Record<string, unknown> } | null> {
    const config = getTwoBighaConfig();
    if (!config) return null;

    let availablilityStatus: string | undefined = undefined;
    if (params.status === "Available") availablilityStatus = "AVAILABLE";
    else if (params.status === "Sold") availablilityStatus = "SOLD";
    else if (params.status === "Under Offer") availablilityStatus = "MANAGED";

    try {
      const data = await twoBighaGraphqlRequest<{
        properties?: { data?: Record<string, unknown>[]; meta?: Record<string, unknown> } | null;
      }>(config, GET_PROPERTIES_QUERY, {
        input: {
          page: params.page ?? 1,
          limit: params.limit ?? 20,
          searchTerm: params.searchTerm || undefined,
          availablilityStatus,
        },
      });
      return {
        data: data?.properties?.data || [],
        meta: data?.properties?.meta,
      };
    } catch (e: any) {
      this.logger.error(`2bigha getProperties failed: ${e?.message}`);
      return null;
    }
  }
}
