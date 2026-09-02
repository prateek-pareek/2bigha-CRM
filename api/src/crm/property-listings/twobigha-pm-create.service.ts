import { Injectable, Logger } from '@nestjs/common';
import { getTwoBighaConfig, twoBighaGraphqlRequest } from '../shared/twobigha-graphql.util';

/**
 * PM property create / bind — process-flow §3.
 *
 * Marketplace `createProperty` is the buy/sell listing API. A PM case must
 * use the PM admin/user create APIs, then `tagSubscriptionToProperty` when
 * an unbound credit exists.
 *
 * CRM uses `pmAdminAddPropertyOnly` (API-key auth). `createManagedPropertyByUser`
 * requires an end-user session JWT and returns UNAUTHENTICATED for CRM keys.
 * Assignment and visit APIs all key off the resulting `userPropertyId`.
 */

export type TwoBighaPmCreateStatus = 'synced' | 'mock' | 'failed';

export interface TwoBighaPmCreateInput {
  listingId: string;
  userId: string;
  title: string;
  description?: string;
  propertyType?: string;
  state?: string;
  district?: string;
  city?: string;
  village?: string;
  tehsil?: string;
  area?: number;
  areaUnit?: string;
  zipCode?: string;
  khasraNumber?: string;
  googleMapsLink?: string;
  /** Numeric 2bigha PM plan id from getPMPlans — not the CRM label (Basic/Standard). */
  planId?: number;
  /** Existing marketplace/managed property id, if create already succeeded. */
  existingPropertyId?: string;
  existingUserPropertyId?: string;
}

export interface TwoBighaPmCreateResult {
  status: TwoBighaPmCreateStatus;
  userPropertyId?: string;
  twobighaPropertyId?: string;
  tagged?: boolean;
  error?: string;
  detail?: Record<string, unknown>;
  syncedAt: Date;
}

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
  Farm: 'FARMLAND',
};

const AREA_UNIT_MAP: Record<string, string> = {
  Bigha: 'BIGHA',
  Katha: 'KATHA',
  'Sq. Yard': 'SQYRD',
  'Sq. Ft': 'SQFT',
  'Sq. M': 'SQM',
  Acre: 'ACRE',
  Hectare: 'HECTARE',
  Marla: 'MARLA',
  Kanal: 'KANAL',
  Guntha: 'GUNTA',
  Cent: 'CENT',
  Nali: 'NALI',
  SQYRD: 'SQYRD',
  SQFT: 'SQFT',
  SQM: 'SQM',
  ACRE: 'ACRE',
  HECTARE: 'HECTARE',
  BIGHA: 'BIGHA',
  KATHA: 'KATHA',
  MARLA: 'MARLA',
  KANAL: 'KANAL',
  GUNTA: 'GUNTA',
  CENT: 'CENT',
  NALI: 'NALI',
  BIGHAS: 'BIGHAS',
  SQUARE_FEET: 'SQUARE_FEET',
};

const PM_ADMIN_ADD_PROPERTY = `
  mutation PmAdminAddPropertyOnly($input: PMAdminAddPropertyOnlyInput!) {
    pmAdminAddPropertyOnly(input: $input) {
      id
      title
    }
  }
`;

const TAG_SUBSCRIPTION = `
  mutation TagSubscriptionToProperty(
    $subscriptionId: Int!
    $propertyId: String!
    $userId: String!
  ) {
    tagSubscriptionToProperty(
      subscriptionId: $subscriptionId
      propertyId: $propertyId
      userId: $userId
    ) {
      success
      message
      data
    }
  }
`;

const UNBOUND_SUBS = `
  query GetUnboundSubscriptionsByUserId($userId: String!) {
    getUnboundSubscriptionsByUserId(userId: $userId) {
      subscriptionId
      planName
    }
  }
`;

const MANAGED_DETAIL = `
  query GetManagedPropertyDetail($propertyId: String, $userPropertyId: String) {
    getManagedPropertyDetail(propertyId: $propertyId, userPropertyId: $userPropertyId) {
      userPropertyId
    }
  }
`;

function mapPropertyType(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim();
  return PROPERTY_TYPE_MAP[key] || key.toUpperCase().replace(/\s+/g, '_');
}

function mapAreaUnit(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim();
  return AREA_UNIT_MAP[key] || key.toUpperCase().replace(/[\s.]+/g, '');
}

function parsePincode(zip?: string): number | undefined {
  const digits = String(zip || '').replace(/\D/g, '');
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

function extractUserPropertyId(data: unknown): string | undefined {
  if (!data) return undefined;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (typeof data !== 'object') return undefined;
  const rec = data as Record<string, unknown>;
  for (const key of ['userPropertyId', 'user_property_id', 'managePropertyId']) {
    const v = rec[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  if (rec.data) return extractUserPropertyId(rec.data);
  return undefined;
}

@Injectable()
export class TwoBighaPmCreateService {
  private readonly logger = new Logger(TwoBighaPmCreateService.name);

  async createOrBind(input: TwoBighaPmCreateInput): Promise<TwoBighaPmCreateResult> {
    const config = getTwoBighaConfig();
    if (!config) {
      this.logger.log(
        `Mock PM create for listing ${input.listingId} (TWOBIGHA_USE_MOCK or missing credentials).`,
      );
      return {
        status: 'mock',
        userPropertyId: input.existingUserPropertyId || `mock-up-${input.listingId}`,
        twobighaPropertyId: input.existingPropertyId || `mock-mp-${input.listingId}`,
        tagged: true,
        syncedAt: new Date(),
      };
    }

    if (input.existingUserPropertyId?.trim()) {
      return {
        status: 'synced',
        userPropertyId: input.existingUserPropertyId.trim(),
        twobighaPropertyId: input.existingPropertyId,
        syncedAt: new Date(),
      };
    }

    try {
      let propertyId = input.existingPropertyId?.trim() || undefined;
      let userPropertyId: string | undefined;
      let createDetail: Record<string, unknown> | undefined;
      let tagged = false;

      if (!propertyId) {
        const adminCreated = await twoBighaGraphqlRequest<{
          pmAdminAddPropertyOnly?: { id?: string; title?: string };
        }>(config, PM_ADMIN_ADD_PROPERTY, {
          input: {
            userId: input.userId,
            property: this.buildAdminPropertyInput(input),
          },
        });

        const payload = adminCreated?.pmAdminAddPropertyOnly;
        createDetail = (payload as Record<string, unknown>) || undefined;
        propertyId = payload?.id ? String(payload.id) : undefined;

        if (!propertyId) {
          return {
            status: 'failed',
            error:
              'pmAdminAddPropertyOnly returned no property id. Check 2bigha PM admin permissions for the CRM API key.',
            detail: createDetail,
            syncedAt: new Date(),
          };
        }
      }

      if (!userPropertyId && propertyId) {
        const unboundCount = await this.countUnboundSubscriptions(config, input.userId);
        const taggedId = await this.tagOldestUnbound(config, {
          userId: input.userId,
          propertyId,
        });
        if (taggedId) {
          tagged = true;
          userPropertyId = taggedId;
        } else {
          userPropertyId =
            (await this.lookupUserPropertyId(config, propertyId)) || undefined;
        }

        if (!userPropertyId && unboundCount === 0) {
          return {
            status: 'failed',
            twobighaPropertyId: propertyId,
            error:
              'Property was created on 2bigha but is not bound to a PM subscription. Collect PM payment first (no unbound subscription on this client), then click Retry 2bigha sync.',
            detail: createDetail,
            syncedAt: new Date(),
          };
        }
      }

      if (!userPropertyId) {
        return {
          status: 'failed',
          twobighaPropertyId: propertyId,
          error:
            'Property exists on 2bigha but no userPropertyId was bound. Ensure an ACTIVE unbound PM subscription exists, then retry sync.',
          detail: createDetail,
          syncedAt: new Date(),
        };
      }

      return {
        status: 'synced',
        userPropertyId,
        twobighaPropertyId: propertyId,
        tagged,
        detail: createDetail,
        syncedAt: new Date(),
      };
    } catch (e: any) {
      const message = e?.message || String(e);
      this.logger.warn(`2bigha PM create failed for listing ${input.listingId}: ${message}`);
      return {
        status: 'failed',
        twobighaPropertyId: input.existingPropertyId,
        error: message.includes('UNAUTHENTICATED')
          ? '2bigha rejected PM create (Not authenticated). CRM now uses pmAdminAddPropertyOnly — restart the API and retry sync.'
          : message,
        syncedAt: new Date(),
      };
    }
  }

  /** Admin PM property payload — lowercase field names per PMAdminManagedPropertyInput. */
  private buildAdminPropertyInput(input: TwoBighaPmCreateInput): Record<string, unknown> {
    const body: Record<string, unknown> = {
      title: input.title,
    };
    if (input.description) body.description = input.description;
    const type = mapPropertyType(input.propertyType);
    if (type) body.propertyType = type;
    if (input.state) body.state = input.state;
    if (input.district) body.district = input.district;
    if (input.city) body.city = input.city;
    if (typeof input.area === 'number' && Number.isFinite(input.area)) body.area = input.area;
    const unit = mapAreaUnit(input.areaUnit);
    if (unit) body.areaUnit = unit;
    const pin = parsePincode(input.zipCode);
    if (pin != null) body.pincode = pin;
    if (input.tehsil) body.tehsil = input.tehsil;
    if (input.khasraNumber) body.khasraNumber = input.khasraNumber;
    if (input.googleMapsLink) body.googleMapsLink = input.googleMapsLink;
    if (input.village) body.villageOrArea = input.village;
    const address = [input.village, input.city, input.district].filter(Boolean).join(', ');
    if (address) body.address = address;
    return body;
  }

  private async countUnboundSubscriptions(
    config: NonNullable<ReturnType<typeof getTwoBighaConfig>>,
    userId: string,
  ): Promise<number> {
    try {
      const data = await twoBighaGraphqlRequest<{
        getUnboundSubscriptionsByUserId?: Array<{ subscriptionId?: number }>;
      }>(config, UNBOUND_SUBS, { userId });
      return data?.getUnboundSubscriptionsByUserId?.length || 0;
    } catch {
      return 0;
    }
  }

  private async tagOldestUnbound(
    config: NonNullable<ReturnType<typeof getTwoBighaConfig>>,
    args: { userId: string; propertyId: string },
  ): Promise<string | undefined> {
    let unbound: Array<{ subscriptionId?: number }> = [];
    try {
      const data = await twoBighaGraphqlRequest<{
        getUnboundSubscriptionsByUserId?: Array<{ subscriptionId?: number; planName?: string }>;
      }>(config, UNBOUND_SUBS, { userId: args.userId });
      unbound = data?.getUnboundSubscriptionsByUserId || [];
    } catch (e: any) {
      this.logger.warn(`getUnboundSubscriptionsByUserId failed: ${e?.message}`);
      return undefined;
    }

    const subscriptionId = unbound[0]?.subscriptionId;
    if (typeof subscriptionId !== 'number') return undefined;

    try {
      const tagged = await twoBighaGraphqlRequest<{
        tagSubscriptionToProperty?: { success?: boolean; message?: string; data?: unknown };
      }>(config, TAG_SUBSCRIPTION, {
        subscriptionId,
        propertyId: args.propertyId,
        userId: args.userId,
      });
      const res = tagged?.tagSubscriptionToProperty;
      if (res && res.success === false) {
        this.logger.warn(
          `tagSubscriptionToProperty declined for property ${args.propertyId}: ${res.message}`,
        );
        return extractUserPropertyId(res.data) || (await this.lookupUserPropertyId(config, args.propertyId));
      }
      return (
        extractUserPropertyId(res?.data) ||
        (await this.lookupUserPropertyId(config, args.propertyId))
      );
    } catch (e: any) {
      this.logger.warn(`tagSubscriptionToProperty failed: ${e?.message}`);
      return this.lookupUserPropertyId(config, args.propertyId);
    }
  }

  private async lookupUserPropertyId(
    config: NonNullable<ReturnType<typeof getTwoBighaConfig>>,
    propertyId: string,
  ): Promise<string | undefined> {
    try {
      const data = await twoBighaGraphqlRequest<{
        getManagedPropertyDetail?: { userPropertyId?: string | null };
      }>(config, MANAGED_DETAIL, { propertyId, userPropertyId: undefined });
      return data?.getManagedPropertyDetail?.userPropertyId?.trim() || undefined;
    } catch (e: any) {
      this.logger.warn(`getManagedPropertyDetail after PM create failed: ${e?.message}`);
      return undefined;
    }
  }
}
