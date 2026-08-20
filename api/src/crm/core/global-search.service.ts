import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { Deal, DealDocument } from '../schemas/deal.schema';
import { Contact, ContactDocument } from '../schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../schemas/organization.schema';
import { Client, ClientDocument } from '../schemas/client.schema';
import {
  PlatformOpportunity,
  PlatformOpportunityDocument,
} from '../schemas/platform-opportunity.schema';
import { AppCacheService } from '../../redis/app-cache.service';
import {
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
  deals: unknown[];
  contacts: unknown[];
  organizations: unknown[];
  clients: unknown[];
  platformOpportunities: unknown[];
};

@Injectable()
export class GlobalSearchService {
  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private leadModel: Model<LeadDocument>,
    @InjectModel(Deal.name, 'crmConnection')
    private dealModel: Model<DealDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private orgModel: Model<OrganizationDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private clientModel: Model<ClientDocument>,
    @InjectModel(PlatformOpportunity.name, 'crmConnection')
    private platformOpportunityModel: Model<PlatformOpportunityDocument>,
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
    const key = `crm:search:${full ? 'full' : 'hdr'}:v3:${this.appCache.digest({ q: q.toLowerCase() })}`;
    return this.appCache.getOrSet(key, this.appCache.searchTtl(), () =>
      this.searchDb(q, full ? FULL_SEARCH_LIMIT : HEADER_SEARCH_LIMIT),
    );
  }

  private emptySlice(): SearchSlice {
    return {
      leads: [],
      deals: [],
      contacts: [],
      organizations: [],
      clients: [],
      platformOpportunities: [],
    };
  }

  private async searchDb(query: string, limit: number): Promise<SearchSlice> {
    if (looksLikeObjectId(query)) {
      return this.searchByObjectId(query);
    }

    const textQ = toTextSearchString(query);
    const maxTime =
      limit > HEADER_SEARCH_LIMIT ? FULL_QUERY_MAX_TIME_MS : QUERY_MAX_TIME_MS;
    const [
      leads,
      deals,
      contacts,
      organizations,
      clients,
      platformOpportunities,
    ] = await Promise.all([
      this.searchLeads(query, textQ, limit, maxTime),
      this.searchDeals(query, textQ, limit, maxTime),
      this.searchContacts(query, textQ, limit, maxTime),
      this.searchOrganizations(query, textQ, limit, maxTime),
      this.searchClients(query, textQ, limit, maxTime),
      this.searchPlatformOpportunities(query, textQ, limit, maxTime),
    ]);

    return {
      leads,
      deals,
      contacts,
      organizations,
      clients,
      platformOpportunities,
    };
  }

  private async searchByObjectId(id: string): Promise<SearchSlice> {
    const oid = new Types.ObjectId(id);
    const select = '_id firstName lastName email name title organization dealValue status opportunitySourcePlatform platformClientLabel';
    const [lead, deal, contact, org, client, platform] = await Promise.all([
      this.leadModel.findById(oid).select(select).lean().maxTimeMS(QUERY_MAX_TIME_MS).exec(),
      this.dealModel.findById(oid).select(select).lean().maxTimeMS(QUERY_MAX_TIME_MS).exec(),
      this.contactModel.findById(oid).select(select).lean().maxTimeMS(QUERY_MAX_TIME_MS).exec(),
      this.orgModel.findById(oid).select(select).lean().maxTimeMS(QUERY_MAX_TIME_MS).exec(),
      this.clientModel.findById(oid).select(select).lean().maxTimeMS(QUERY_MAX_TIME_MS).exec(),
      this.platformOpportunityModel.findById(oid).select(select).lean().maxTimeMS(QUERY_MAX_TIME_MS).exec(),
    ]);
    return {
      leads: lead ? [lead] : [],
      deals: deal ? [deal] : [],
      contacts: contact ? [contact] : [],
      organizations: org ? [org] : [],
      clients: client ? [client] : [],
      platformOpportunities: platform ? [platform] : [],
    };
  }

  private async searchWithTextThenRegex(
    model: Model<unknown>,
    textQ: string,
    regexFilter: Record<string, unknown> | null,
    projection: Record<string, 1>,
    limit: number,
    maxTimeMS: number,
  ): Promise<unknown[]> {
    if (textQ.length >= 2) {
      try {
        const textRows = await model
          .find(
            { $text: { $search: textQ } },
            { ...projection, score: { $meta: 'textScore' } },
          )
          .sort({ score: { $meta: 'textScore' } })
          .limit(limit)
          .lean()
          .maxTimeMS(maxTimeMS)
          .exec();
        if (textRows.length > 0) {
          return textRows.map((row) => {
            const copy = { ...(row as Record<string, unknown>) };
            delete copy.score;
            return copy;
          });
        }
      } catch {
        /* text index missing or unsupported query — fall through */
      }
    }

    if (!regexFilter) return [];
    return model
      .find(regexFilter, projection)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()
      .maxTimeMS(maxTimeMS)
      .exec();
  }

  private searchLeads(
    query: string,
    textQ: string,
    limit: number,
    maxTimeMS: number,
  ) {
    const regexFilter = buildTokenAndFilter(
      ['firstName', 'lastName', 'email', 'organization', 'mobileNo', 'phone'],
      query,
    );
    return this.searchWithTextThenRegex(
      this.leadModel as Model<unknown>,
      textQ,
      regexFilter,
      {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        mobileNo: 1,
        phone: 1,
        organization: 1,
        status: 1,
      },
      limit,
      maxTimeMS,
    );
  }

  private searchDeals(
    query: string,
    textQ: string,
    limit: number,
    maxTimeMS: number,
  ) {
    const regexFilter = buildTokenAndFilter(
      ['title', 'organization'],
      query,
    );
    return this.searchWithTextThenRegex(
      this.dealModel as Model<unknown>,
      textQ,
      regexFilter,
      {
        _id: 1,
        title: 1,
        organization: 1,
        dealValue: 1,
        status: 1,
      },
      limit,
      maxTimeMS,
    );
  }

  private searchContacts(
    query: string,
    textQ: string,
    limit: number,
    maxTimeMS: number,
  ) {
    const regexFilter = buildTokenAndFilter(
      ['firstName', 'lastName', 'email', 'mobileNo', 'phone'],
      query,
    );
    return this.searchWithTextThenRegex(
      this.contactModel as Model<unknown>,
      textQ,
      regexFilter,
      {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        mobileNo: 1,
        phone: 1,
      },
      limit,
      maxTimeMS,
    );
  }

  private searchOrganizations(
    query: string,
    textQ: string,
    limit: number,
    maxTimeMS: number,
  ) {
    const regexFilter = buildTokenAndFilter(['name', 'industry'], query);
    return this.searchWithTextThenRegex(
      this.orgModel as Model<unknown>,
      textQ,
      regexFilter,
      { _id: 1, name: 1, industry: 1 },
      limit,
      maxTimeMS,
    );
  }

  private searchClients(
    query: string,
    textQ: string,
    limit: number,
    maxTimeMS: number,
  ) {
    const regexFilter = buildTokenAndFilter(
      ['name', 'email', 'phone', 'whatsappNumber'],
      query,
    );
    return this.searchWithTextThenRegex(
      this.clientModel as Model<unknown>,
      textQ,
      regexFilter,
      { _id: 1, name: 1, email: 1, phone: 1, whatsappNumber: 1, role: 1 },
      limit,
      maxTimeMS,
    );
  }

  private searchPlatformOpportunities(
    query: string,
    textQ: string,
    limit: number,
    maxTimeMS: number,
  ) {
    const regexFilter = buildTokenAndFilter(
      ['title', 'opportunitySourcePlatform', 'platformClientLabel'],
      query,
    );
    return this.searchWithTextThenRegex(
      this.platformOpportunityModel as Model<unknown>,
      textQ,
      regexFilter,
      {
        _id: 1,
        title: 1,
        opportunitySourcePlatform: 1,
        platformClientLabel: 1,
      },
      limit,
      maxTimeMS,
    );
  }
}
