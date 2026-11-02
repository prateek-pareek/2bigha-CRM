import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import {
  PropertyListing,
  PropertyListingDocument,
} from '../property-listings/schemas/property-listing.schema';
import { AppCacheService } from '../../redis/app-cache.service';
import {
  buildPhoneDigitsRegex,
  buildTokenAndFilter,
  looksLikeObjectId,
  normalizeSearchQuery,
  toTextSearchString,
} from '../../common/lib/search/search-query.util';

const HEADER_SEARCH_LIMIT = 5;
const FULL_SEARCH_LIMIT = 50;
const QUERY_MAX_TIME_MS = 2500;
const FULL_QUERY_MAX_TIME_MS = 5000;

export type GlobalSearchOptions = {
  /** When true, return up to 50 matches per entity (full results page). */
  full?: boolean;
};

type SearchSlice = {
  leads: unknown[];
  contacts: unknown[];
  organizations: unknown[];
  clients: unknown[];
  properties: unknown[];
};

type EntitySearchSpec = {
  model: Model<unknown>;
  /** Fields matched by the multi-word contains search. */
  textFields: string[];
  /** Fields matched by the separator-tolerant phone search. */
  phoneFields: string[];
  projection: Record<string, 1>;
};

@Injectable()
export class GlobalSearchService {
  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private orgModel: Model<OrganizationDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(PropertyListing.name, 'crmConnection')
    private propertyModel: Model<PropertyListingDocument>,
    private readonly appCache: AppCacheService,
  ) {}

  async search(
    query: string,
    options?: GlobalSearchOptions,
  ): Promise<SearchSlice> {
    const q = normalizeSearchQuery(query);
    if (q.length < 2) {
      return this.emptySlice();
    }
    const full = options?.full === true;
    const key = `crm:search:${full ? 'full' : 'hdr'}:v4:${this.appCache.digest({ q: q.toLowerCase() })}`;
    return this.appCache.getOrSet(key, this.appCache.searchTtl(), () =>
      this.searchDb(q, full ? FULL_SEARCH_LIMIT : HEADER_SEARCH_LIMIT),
    );
  }

  private emptySlice(): SearchSlice {
    return {
      leads: [],
      contacts: [],
      organizations: [],
      clients: [],
      properties: [],
    };
  }

  private async searchDb(query: string, limit: number): Promise<SearchSlice> {
    if (looksLikeObjectId(query)) {
      return this.searchByObjectId(query);
    }

    const textQ = toTextSearchString(query);
    const phoneRe = buildPhoneDigitsRegex(query);
    const maxTime =
      limit > HEADER_SEARCH_LIMIT ? FULL_QUERY_MAX_TIME_MS : QUERY_MAX_TIME_MS;
    const run = (spec: EntitySearchSpec) =>
      this.searchEntity(spec, query, textQ, phoneRe, limit, maxTime);

    const [leads, contacts, organizations, clients, properties] =
      await Promise.all([
        run(this.leadSpec()),
        run(this.contactSpec()),
        run(this.organizationSpec()),
        run(this.clientSpec()),
        run(this.propertySpec()),
      ]);

    return { leads, contacts, organizations, clients, properties };
  }

  private async searchByObjectId(id: string): Promise<SearchSlice> {
    const oid = new Types.ObjectId(id);
    const find = (spec: EntitySearchSpec): Promise<unknown> =>
      spec.model
        .findById(oid, spec.projection)
        .lean()
        .maxTimeMS(QUERY_MAX_TIME_MS)
        .exec()
        .catch(() => null);
    const [lead, contact, org, client, property] = await Promise.all([
      find(this.leadSpec()),
      find(this.contactSpec()),
      find(this.organizationSpec()),
      find(this.clientSpec()),
      find(this.propertySpec()),
    ]);
    return {
      leads: lead ? [lead] : [],
      contacts: contact ? [contact] : [],
      organizations: org ? [org] : [],
      clients: client ? [client] : [],
      properties: property ? [property] : [],
    };
  }

  /**
   * Full-word `$text` hits first (best ranked), then contains / phone matches so partial
   * names ("Ravi" → "Ravinder") and differently formatted numbers are not dropped.
   * A failing or slow query only empties its own entity, never the whole search.
   */
  private async searchEntity(
    spec: EntitySearchSpec,
    query: string,
    textQ: string,
    phoneRe: RegExp | null,
    limit: number,
    maxTimeMS: number,
  ): Promise<unknown[]> {
    const clauses: Record<string, unknown>[] = [];
    const tokenFilter = buildTokenAndFilter(spec.textFields, query);
    if (tokenFilter) clauses.push(tokenFilter);
    if (phoneRe && spec.phoneFields.length) {
      clauses.push({ $or: spec.phoneFields.map((f) => ({ [f]: phoneRe })) });
    }
    const regexFilter =
      clauses.length === 0
        ? null
        : clauses.length === 1
          ? clauses[0]
          : { $or: clauses };

    // Phone-style queries skip $text: it only matches whole stored tokens.
    const textPromise: Promise<unknown[]> =
      textQ.length >= 2 && !phoneRe
        ? spec.model
            .find(
              { $text: { $search: textQ } },
              { ...spec.projection, score: { $meta: 'textScore' } },
            )
            .sort({ score: { $meta: 'textScore' } })
            .limit(limit)
            .lean()
            .maxTimeMS(maxTimeMS)
            .exec()
            .catch((): unknown[] => []) // text index missing / unsupported query
        : Promise.resolve([]);

    const regexPromise: Promise<unknown[]> = regexFilter
      ? spec.model
          .find(regexFilter, spec.projection)
          .sort({ updatedAt: -1 })
          .limit(limit)
          .lean()
          .maxTimeMS(maxTimeMS)
          .exec()
          .catch((err: any): unknown[] => {
            console.warn(
              '[GlobalSearch] contains search failed:',
              err?.message || err,
            );
            return [];
          })
      : Promise.resolve([]);

    const [textRows, regexRows] = await Promise.all([
      textPromise,
      regexPromise,
    ]);
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const row of [...textRows, ...regexRows]) {
      const copy = { ...(row as Record<string, unknown>) };
      delete copy.score;
      const id = String(copy._id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(copy);
      if (out.length >= limit) break;
    }
    return out;
  }

  private leadSpec(): EntitySearchSpec {
    return {
      model: this.leadModel as Model<unknown>,
      textFields: [
        'firstName',
        'lastName',
        'email',
        'organization',
        'mobileNo',
        'phone',
        'whatsappNumber',
      ],
      phoneFields: ['mobileNo', 'phone', 'whatsappNumber'],
      projection: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        mobileNo: 1,
        phone: 1,
        whatsappNumber: 1,
        organization: 1,
        status: 1,
      },
    };
  }

  private contactSpec(): EntitySearchSpec {
    return {
      model: this.contactModel as Model<unknown>,
      textFields: ['firstName', 'lastName', 'email', 'mobileNo', 'phone'],
      phoneFields: ['mobileNo', 'phone'],
      projection: {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        mobileNo: 1,
        phone: 1,
      },
    };
  }

  private organizationSpec(): EntitySearchSpec {
    return {
      model: this.orgModel as Model<unknown>,
      textFields: ['name', 'industry'],
      phoneFields: [],
      projection: { _id: 1, name: 1, industry: 1 },
    };
  }

  private clientSpec(): EntitySearchSpec {
    return {
      model: this.clientModel as Model<unknown>,
      textFields: ['name', 'email', 'phone', 'whatsappNumber'],
      phoneFields: ['phone', 'whatsappNumber'],
      projection: {
        _id: 1,
        name: 1,
        email: 1,
        phone: 1,
        whatsappNumber: 1,
        role: 1,
      },
    };
  }

  private propertySpec(): EntitySearchSpec {
    return {
      model: this.propertyModel as Model<unknown>,
      textFields: [
        'title',
        'address',
        'city',
        'district',
        'tehsil',
        'village',
        'khasraNumber',
        'contactName',
        'contactEmail',
        'contactPhone',
        'whatsappNumber',
      ],
      phoneFields: ['contactPhone', 'whatsappNumber'],
      projection: {
        _id: 1,
        title: 1,
        address: 1,
        city: 1,
        district: 1,
        village: 1,
        contactName: 1,
        contactPhone: 1,
        status: 1,
        propertyType: 1,
      },
    };
  }
}
