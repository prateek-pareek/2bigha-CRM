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
import { CrmSnippet, CrmSnippetDocument } from '../schemas/crm-snippet.schema';
import type { WorkflowEntityType } from '../schemas/workflow-delayed-job.schema';

export type EmailMergeSender = {
  firstName?: string;
  lastName?: string;
  email?: string;
};

function add(out: Record<string, string>, k: string, v: unknown) {
  if (v == null) return;
  const s = String(v).trim();
  if (!s) return;
  out[k] = s;
}

function formatMoney(amount: number, currency?: string): string {
  const cur = (currency || 'USD').trim() || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
    }).format(amount);
  } catch {
    return `${amount} ${cur}`;
  }
}

function formatDate(d: Date | string | undefined | null): string {
  if (d == null) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function mergeCustomFields(
  out: Record<string, string>,
  custom: Record<string, unknown> | undefined | null,
) {
  if (!custom || typeof custom !== 'object') return;
  for (const [k, v] of Object.entries(custom)) {
    if (v == null) continue;
    let text: string;
    if (Array.isArray(v)) text = v.map((x) => String(x)).join(', ');
    else if (typeof v === 'object') text = JSON.stringify(v);
    else text = String(v);
    const t = text.trim();
    if (!t) continue;
    const safe = k.replace(/[^\w]/g, '_');
    out[`custom_${safe}`] = t;
  }
}

function appendSender(out: Record<string, string>, sender?: EmailMergeSender) {
  if (!sender) return;
  add(out, 'senderFirstName', sender.firstName);
  add(out, 'senderLastName', sender.lastName);
  const sf = String(sender.firstName || '').trim();
  const sl = String(sender.lastName || '').trim();
  const full = [sf, sl].filter(Boolean).join(' ');
  if (full) {
    out.senderFullName = full;
    out.myName = full;
  }
  add(out, 'senderEmail', sender.email);
}

function leanDoc(doc: unknown): Record<string, unknown> {
  return doc as unknown as Record<string, unknown>;
}

function appendToday(out: Record<string, string>) {
  const now = new Date();
  out.today = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  out.todayLong = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function toObjectIdString(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' && Types.ObjectId.isValid(v)) return String(v);
  if (typeof v === 'object' && v !== null) {
    if ('_id' in v) {
      const id = (v as { _id?: unknown })._id;
      if (id && Types.ObjectId.isValid(String(id))) return String(id);
    }
  }
  return null;
}

function extractLinksFromHtmlOrText(raw: string): string[] {
  if (!raw) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  const textUrlRe = /\bhttps?:\/\/[^\s<>"')]+/gi;
  const pushUrl = (u: string) => {
    const t = String(u || '').trim();
    if (!/^https?:\/\//i.test(t)) return;
    const normalized = t.replace(/[),.;!?]+$/g, '');
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    urls.push(normalized);
  };
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(raw)) !== null) pushUrl(m[1] || '');
  while ((m = textUrlRe.exec(raw)) !== null) pushUrl(m[0] || '');
  return urls;
}

@Injectable()
export class EmailTemplateMergeService {
  constructor(
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Contact.name, 'crmConnection')
    private readonly contactModel: Model<ContactDocument>,
    @InjectModel(Organization.name, 'crmConnection')
    private readonly organizationModel: Model<OrganizationDocument>,
    @InjectModel(Client.name, 'crmConnection')
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(CrmSnippet.name, 'crmConnection')
    private readonly snippetModel: Model<CrmSnippetDocument>,
  ) {}

  /** For manual compose / preview: load record by CRM module + id. */
  async mergeForComposer(
    module: string,
    entityId: string,
    sender?: EmailMergeSender,
  ): Promise<Record<string, string>> {
    if (!entityId || !Types.ObjectId.isValid(entityId)) return {};
    const mod = (module || '').toLowerCase();
    const oid = new Types.ObjectId(entityId);

    if (mod === 'leads') {
      const doc = await this.leadModel
        .findById(oid)
        .populate({ path: 'relatedService', select: '_id name' })
        .populate({
          path: 'associatedOrganizations',
          select: 'name website industry noOfEmployees territory phone email address',
        })
        .lean()
        .exec();
      if (!doc) return {};
      const out = this.mergeFromLead(leanDoc(doc), sender);
      await this.appendSmartSnippetLinkFields(out, leanDoc(doc));
      return out;
    }
    if (mod === 'contacts') {
      const doc = await this.contactModel
        .findById(oid)
        .populate({
          path: 'associatedOrganizations',
          select: 'name website industry noOfEmployees territory phone email address',
        })
        .lean()
        .exec();
      if (!doc) return {};
      const out = this.mergeFromContact(leanDoc(doc), sender);
      await this.appendSmartSnippetLinkFields(out, leanDoc(doc));
      return out;
    }
    if (mod === 'organizations') {
      const doc = await this.organizationModel.findById(oid).lean().exec();
      if (!doc) return {};
      const out = this.mergeFromOrganization(leanDoc(doc), sender);
      await this.appendSmartSnippetLinkFields(out, leanDoc(doc));
      return out;
    }
    if (mod === 'clients') {
      const doc = await this.clientModel
        .findById(oid)
        .populate({
          path: 'organization',
          select: 'name website industry noOfEmployees territory phone email address',
        })
        .lean()
        .exec();
      if (!doc) return {};
      const out = this.mergeFromClient(leanDoc(doc), sender);
      await this.appendSmartSnippetLinkFields(out, leanDoc(doc));
      return out;
    }
    return {};
  }

  /** For workflow sends: loads fresh CRM rows so merges match manual compose. */
  async mergeForWorkflow(
    entityType: WorkflowEntityType,
    entityId: Types.ObjectId,
    record: Record<string, unknown>,
    sender?: EmailMergeSender,
  ): Promise<Record<string, string>> {
    const orgSelect =
      'name website industry noOfEmployees territory phone email address';

    if (entityType === 'Lead') {
      const doc = await this.leadModel
        .findById(entityId)
        .populate({ path: 'relatedService', select: '_id name' })
        .populate({ path: 'associatedOrganizations', select: orgSelect })
        .lean()
        .exec();
      if (doc) {
        const out = this.mergeFromLead(leanDoc(doc), sender);
        await this.appendSmartSnippetLinkFields(out, leanDoc(doc));
        return out;
      }
      const out = this.mergeFromLead(record, sender);
      await this.appendSmartSnippetLinkFields(out, record);
      return out;
    }
    if (entityType === 'Contact') {
      const doc = await this.contactModel
        .findById(entityId)
        .populate({ path: 'associatedOrganizations', select: orgSelect })
        .lean()
        .exec();
      if (doc) {
        const out = this.mergeFromContact(leanDoc(doc), sender);
        await this.appendSmartSnippetLinkFields(out, leanDoc(doc));
        return out;
      }
      const out = this.mergeFromContact(record, sender);
      await this.appendSmartSnippetLinkFields(out, record);
      return out;
    }
    if (entityType === 'Organization') {
      const doc = await this.organizationModel.findById(entityId).lean().exec();
      if (doc) {
        const out = this.mergeFromOrganization(leanDoc(doc), sender);
        await this.appendSmartSnippetLinkFields(out, leanDoc(doc));
        return out;
      }
      const out = this.mergeFromOrganization(record, sender);
      await this.appendSmartSnippetLinkFields(out, record);
      return out;
    }
    return {};
  }

  private inferRelatedServiceId(record: Record<string, unknown>): string | null {
    const direct = toObjectIdString(record.relatedService);
    if (direct) return direct;
    const lead = record.lead as Record<string, unknown> | null;
    if (lead && typeof lead === 'object') {
      const fromLead = toObjectIdString(lead.relatedService);
      if (fromLead) return fromLead;
    }
    const custom = (record.customFields || {}) as Record<string, unknown>;
    const candidateKeys = [
      'relatedService',
      'related_service',
      'serviceInterested',
      'service_interested',
      'serviceOffering',
      'service_offering',
    ];
    for (const k of candidateKeys) {
      const fromCustom = toObjectIdString(custom[k]);
      if (fromCustom) return fromCustom;
    }
    return null;
  }

  private async appendSmartSnippetLinkFields(
    out: Record<string, string>,
    record: Record<string, unknown>,
  ): Promise<void> {
    try {
      const sid = this.inferRelatedServiceId(record);
      if (!sid) return;
      const docs = await this.snippetModel
        .find({
          isActive: { $ne: false },
          serviceOfferingIds: new Types.ObjectId(sid),
          categoryMaterial: { $in: ['portfolio', 'case_study'] },
        })
        .select('name body categoryMaterial')
        .sort({ updatedAt: -1 })
        .lean()
        .exec();
      if (!Array.isArray(docs) || docs.length === 0) return;
      const portfolioUrls: string[] = [];
      const caseStudyUrls: string[] = [];
      const allSeen = new Set<string>();
      for (const d of docs) {
        const urls = extractLinksFromHtmlOrText(String(d.body || ''));
        if (!urls.length) continue;
        const mat = String(d.categoryMaterial || '').toLowerCase();
        for (const u of urls) {
          const key = u.toLowerCase();
          if (allSeen.has(key)) continue;
          allSeen.add(key);
          if (mat === 'portfolio') portfolioUrls.push(u);
          else if (mat === 'case_study') caseStudyUrls.push(u);
        }
      }
      const limit = (arr: string[]) => arr.slice(0, 4);
      const p = limit(portfolioUrls);
      const c = limit(caseStudyUrls);
      const both = limit([...c, ...p]);
      if (p.length) {
        out.smartPortfolioLinks = p.map((u) => `- ${u}`).join('\n');
      }
      if (c.length) {
        out.smartCaseStudyLinks = c.map((u) => `- ${u}`).join('\n');
      }
      if (both.length) {
        out.smartProofLinks = both.map((u) => `- ${u}`).join('\n');
      }
    } catch {
      // Best-effort enrichments should not block template rendering.
    }
  }

  private mergeFromLead(
    r: Record<string, unknown>,
    sender?: EmailMergeSender,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    this.addLeadLikePerson(out, r);
    add(out, 'status', r.status);
    add(out, 'source', r.source);
    add(out, 'leadOwner', r.leadOwner);
    add(out, 'linkedinUrl', r.linkedinUrl);
    mergeCustomFields(out, r.customFields as Record<string, unknown>);
    this.applyFirstAssociatedCompany(out, r.associatedOrganizations);
    appendSender(out, sender);
    appendToday(out);
    return out;
  }

  private mergeFromContact(
    r: Record<string, unknown>,
    sender?: EmailMergeSender,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    this.addLeadLikePerson(out, r);
    add(out, 'status', r.status);
    add(out, 'source', r.source);
    add(out, 'leadOwner', r.leadOwner);
    add(out, 'linkedinUrl', r.linkedinUrl);
    add(out, 'telegram', r.telegram);
    add(out, 'address', r.address);
    mergeCustomFields(out, r.customFields as Record<string, unknown>);
    this.applyFirstAssociatedCompany(out, r.associatedOrganizations);
    appendSender(out, sender);
    appendToday(out);
    return out;
  }

  private addLeadLikePerson(
    out: Record<string, string>,
    r: Record<string, unknown>,
  ) {
    add(out, 'salutation', r.salutation);
    add(out, 'firstName', r.firstName);
    add(out, 'middleName', r.middleName);
    add(out, 'lastName', r.lastName);
    const fn = String(r.firstName || '').trim();
    const ln = String(r.lastName || '').trim();
    const full = [fn, ln].filter(Boolean).join(' ');
    if (full) out.fullName = full;
    add(out, 'email', r.email);
    add(out, 'phone', r.phone ?? r.mobileNo);
    add(out, 'mobileNo', r.mobileNo);
    add(out, 'jobTitle', r.jobTitle);
    add(out, 'organization', r.organization);
    add(out, 'company', r.organization);
    add(out, 'companyName', r.organization);
    add(out, 'website', r.website);
    add(out, 'industry', r.industry);
    add(out, 'noOfEmployees', r.noOfEmployees);
    add(out, 'territory', r.territory);
    if (r.annualRevenue != null)
      add(out, 'annualRevenue', r.annualRevenue);
    add(out, 'stage', r.stage);
  }

  private applyFirstAssociatedCompany(
    out: Record<string, string>,
    assoc: unknown,
  ) {
    if (!Array.isArray(assoc) || assoc.length === 0) return;
    const org = assoc[0] as Record<string, unknown> | null;
    if (!org || typeof org !== 'object') return;
    const name = String(org.name || '').trim();
    if (name && !out.companyName) {
      out.companyName = name;
      out.company = name;
    }
    add(out, 'accountName', org.name);
    add(out, 'accountWebsite', org.website);
    add(out, 'accountIndustry', org.industry);
    add(out, 'accountEmployees', org.noOfEmployees);
    add(out, 'accountTerritory', org.territory);
    add(out, 'accountPhone', org.phone);
    add(out, 'accountEmail', org.email);
    add(out, 'accountAddress', org.address);
  }

  private mergeFromOrganization(
    r: Record<string, unknown>,
    sender?: EmailMergeSender,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    add(out, 'name', r.name);
    add(out, 'companyName', r.name);
    add(out, 'website', r.website);
    add(out, 'industry', r.industry);
    add(out, 'territory', r.territory);
    add(out, 'noOfEmployees', r.noOfEmployees);
    add(out, 'phone', r.phone);
    add(out, 'email', r.email);
    add(out, 'address', r.address);
    mergeCustomFields(out, r.customFields as Record<string, unknown>);
    appendSender(out, sender);
    appendToday(out);
    return out;
  }

  private mergeFromClient(
    r: Record<string, unknown>,
    sender?: EmailMergeSender,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    add(out, 'name', r.name);
    add(out, 'fullName', r.name);
    add(out, 'firstName', r.name);
    add(out, 'email', r.email);
    add(out, 'phone', r.phone);
    add(out, 'status', r.status);
    mergeCustomFields(out, r.customFields as Record<string, unknown>);

    const org = r.organization as Record<string, unknown> | null;
    if (org && typeof org === 'object' && org.name) {
      add(out, 'companyName', org.name);
      add(out, 'company', org.name);
      add(out, 'organization', org.name);
      add(out, 'accountName', org.name);
      add(out, 'accountWebsite', org.website);
      add(out, 'accountIndustry', org.industry);
    }

    appendSender(out, sender);
    appendToday(out);
    return out;
  }
}
