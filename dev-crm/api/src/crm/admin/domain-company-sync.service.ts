import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Contact,
  ContactDocument,
} from '../records/schemas/contact.schema';
import {
  Organization,
  OrganizationDocument,
} from '../records/schemas/organization.schema';
import { assignUniqueRecordId } from '../shared/crm-record-id.util';
import {
  companyNameFromDomain,
  extractEmailDomain,
  isCorporateEmailDomain,
  normalizeDomainKey,
  organizationDomainMatchFilter,
  websiteFromDomain,
} from '../shared/crm-email-domain.util';
import { AppCacheService } from '../../redis/app-cache.service';

export type DomainCompanyLinkResult = {
  linked: boolean;
  skippedReason?: string;
  domain?: string;
  organizationId?: string;
  organizationName?: string;
  createdOrganization?: boolean;
};

export type DomainCompanySyncResult = {
  scanned: number;
  domainsProcessed: number;
  organizationsCreated: number;
  organizationsReused: number;
  contactsLinked: number;
  contactsAlreadyLinked: number;
  skippedPublicDomain: number;
  skippedNoEmail: number;
  errors: string[];
};

@Injectable()
export class DomainCompanySyncService {
  private readonly logger = new Logger(DomainCompanySyncService.name);

  constructor(
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private readonly organizationModel: Model<OrganizationDocument>,
    private readonly appCache: AppCacheService,
  ) {}

  /**
   * For a single contact: if email is corporate, ensure a company for that domain
   * and associate the contact (bidirectional).
   */
  async linkContactByEmail(
    contactId: string | Types.ObjectId,
    email?: string | null,
  ): Promise<DomainCompanyLinkResult> {
    const domain = extractEmailDomain(email || undefined);
    if (!domain) {
      return { linked: false, skippedReason: 'no_email_domain' };
    }
    if (!isCorporateEmailDomain(domain)) {
      return {
        linked: false,
        skippedReason: 'public_email_domain',
        domain,
      };
    }

    const { org, created } = await this.ensureOrganizationForDomain(domain);
    if (!org?._id) {
      return { linked: false, skippedReason: 'org_create_failed', domain };
    }

    const contactOid =
      typeof contactId === 'string'
        ? new Types.ObjectId(contactId)
        : contactId;

    const contact = await this.contactModel.findById(contactOid).exec();
    if (!contact) {
      return { linked: false, skippedReason: 'contact_not_found', domain };
    }

    const already = (contact.associatedOrganizations || []).some(
      (id) => String(id) === String(org._id),
    );

    const $set: Record<string, unknown> = {};
    const $addToSet: Record<string, unknown> = {
      associatedOrganizations: org._id,
    };
    // Fill text organization name if empty
    if (!String(contact.organization || '').trim()) {
      $set.organization = org.name;
    }

    await this.contactModel
      .updateOne(
        { _id: contactOid },
        {
          ...(Object.keys($set).length ? { $set } : {}),
          $addToSet,
        },
      )
      .exec();

    await this.organizationModel
      .updateOne(
        { _id: org._id },
        { $addToSet: { associatedContacts: contactOid } },
      )
      .exec();

    await this.appCache.invalidateCrm('contacts', String(contactOid));
    await this.appCache.invalidateCrm('organizations', String(org._id));

    return {
      linked: true,
      domain,
      organizationId: String(org._id),
      organizationName: org.name,
      createdOrganization: created,
      skippedReason: already ? 'already_linked' : undefined,
    };
  }

  /**
   * Admin backfill: group contacts by corporate email domain, create/reuse
   * companies, and associate every contact sharing that domain.
   */
  async syncAllContacts(opts?: {
    dryRun?: boolean;
    limitDomains?: number;
  }): Promise<DomainCompanySyncResult> {
    const dryRun = !!opts?.dryRun;
    const result: DomainCompanySyncResult = {
      scanned: 0,
      domainsProcessed: 0,
      organizationsCreated: 0,
      organizationsReused: 0,
      contactsLinked: 0,
      contactsAlreadyLinked: 0,
      skippedPublicDomain: 0,
      skippedNoEmail: 0,
      errors: [],
    };

    const cursor = this.contactModel
      .find({
        email: { $exists: true, $nin: [null, ''] },
      })
      .select('_id email associatedOrganizations organization')
      .lean()
      .cursor();

    const byDomain = new Map<
      string,
      { contactId: Types.ObjectId; associated: string[] }[]
    >();

    for await (const row of cursor) {
      result.scanned++;
      const domain = extractEmailDomain((row as any).email);
      if (!domain) {
        result.skippedNoEmail++;
        continue;
      }
      if (!isCorporateEmailDomain(domain)) {
        result.skippedPublicDomain++;
        continue;
      }
      const list = byDomain.get(domain) || [];
      list.push({
        contactId: (row as any)._id as Types.ObjectId,
        associated: ((row as any).associatedOrganizations || []).map(String),
      });
      byDomain.set(domain, list);
    }

    let domainCount = 0;
    for (const [domain, contacts] of byDomain) {
      if (opts?.limitDomains && domainCount >= opts.limitDomains) break;
      domainCount++;
      result.domainsProcessed++;
      try {
        if (dryRun) {
          result.contactsLinked += contacts.length;
          continue;
        }
        const { org, created } = await this.ensureOrganizationForDomain(domain);
        if (!org?._id) {
          result.errors.push(`Failed to ensure org for ${domain}`);
          continue;
        }
        if (created) result.organizationsCreated++;
        else result.organizationsReused++;

        const orgId = org._id as Types.ObjectId;
        const toLink = contacts.filter(
          (c) => !c.associated.includes(String(orgId)),
        );
        const already = contacts.length - toLink.length;
        result.contactsAlreadyLinked += already;

        if (toLink.length) {
          const ids = toLink.map((c) => c.contactId);
          await this.contactModel
            .updateMany(
              { _id: { $in: ids } },
              { $addToSet: { associatedOrganizations: orgId } },
            )
            .exec();
          await this.contactModel
            .updateMany(
              {
                _id: { $in: ids },
                $or: [
                  { organization: { $exists: false } },
                  { organization: null },
                  { organization: '' },
                ],
              },
              { $set: { organization: org.name } },
            )
            .exec();
          await this.organizationModel
            .updateOne(
              { _id: orgId },
              { $addToSet: { associatedContacts: { $each: ids } } },
            )
            .exec();
          result.contactsLinked += toLink.length;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        this.logger.warn(`Domain sync failed for ${domain}: ${msg}`);
        if (result.errors.length < 40) {
          result.errors.push(`${domain}: ${msg}`);
        }
      }
    }

    if (!dryRun) {
      await this.appCache.invalidateCrm('contacts');
      await this.appCache.invalidateCrm('organizations');
    }

    return result;
  }

  private async ensureOrganizationForDomain(
    domain: string,
  ): Promise<{ org: OrganizationDocument | null; created: boolean }> {
    const key = normalizeDomainKey(domain);
    if (!key) return { org: null, created: false };

    const website = websiteFromDomain(key);
    const filter = organizationDomainMatchFilter(key);
    const existing = filter
      ? await this.organizationModel.findOne(filter).exec()
      : null;

    if (existing) {
      // Ensure domain marker is set for future lookups
      if (!(existing.customFields as any)?.email_domain) {
        await this.organizationModel
          .updateOne(
            { _id: existing._id },
            {
              $set: {
                'customFields.email_domain': key,
                website: existing.website || website,
              },
            },
          )
          .exec();
      }
      return { org: existing, created: false };
    }

    const name = companyNameFromDomain(key);
    const rid = await assignUniqueRecordId(this.organizationModel, null);
    try {
      const doc = await this.organizationModel.create({
        name,
        website,
        customFields: {
          email_domain: key,
          auto_created_from_email_domain: true,
        },
        recordId: rid.ok ? rid.recordId : undefined,
        associatedContacts: [],
        associatedDeals: [],
      });
      return { org: doc, created: true };
    } catch (err: any) {
      // Race: another sync created the same domain — reuse it
      const raced = filter
        ? await this.organizationModel.findOne(filter).exec()
        : null;
      if (raced) return { org: raced, created: false };
      throw err;
    }
  }
}
