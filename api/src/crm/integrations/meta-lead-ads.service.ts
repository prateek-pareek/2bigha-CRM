import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Integration } from './schemas/integration.schema';
import { Lead, LeadDocument } from '../records/schemas/lead.schema';
import { CRMService } from '../core/crm.service';

const META_API = 'https://graph.facebook.com/v18.0';

/** Fields fetched for a single lead — shared by the webhook path (one lead
 * at a time, via `/{leadgen_id}`) and the polling fallback (many leads at
 * once, via `/{form_id}/leads`); both endpoints return the same shape. */
const LEAD_DETAIL_FIELDS =
  'id,form_id,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,created_time,page_id,platform';

/**
 * Maps Meta's standard Lead Ads `field_data[].name` keys to the Lead fields
 * they correspond to. Anything not listed here (custom questions, whose
 * `name` is whatever the form builder typed) falls through to
 * `Lead.customFields` unchanged.
 */
const KNOWN_FIELD_KEYS: Record<string, string> = {
  full_name: 'fullName',
  first_name: 'firstName',
  last_name: 'lastName',
  email: 'email',
  work_email: 'email',
  phone_number: 'phone',
  work_phone_number: 'phone',
  company_name: 'organization',
  job_title: 'jobTitle',
  city: 'city',
  state: 'state',
  country: 'country',
  zip_code: 'zip',
  post_code: 'zip',
};

type MetaLeadAdsConfig = {
  pageId: string;
  pageAccessToken: string;
  formIds: string[];
  forms?: Array<{ id: string; name: string; status?: string }>;
  lastPolledAt?: Date;
};

@Injectable()
export class MetaLeadAdsService {
  private readonly logger = new Logger(MetaLeadAdsService.name);

  constructor(
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<any>,
    @InjectModel(Lead.name, 'crmConnection')
    private readonly leadModel: Model<LeadDocument>,
    @Inject(forwardRef(() => CRMService))
    private readonly crmService: CRMService,
  ) {}

  private async getConfig(): Promise<MetaLeadAdsConfig | null> {
    const config = await this.integrationModel
      .findOne({ type: 'meta-leadgen' })
      .lean()
      .exec();
    if (!config?.isActive || !config?.pageAccessToken || !config?.pageId) {
      return null;
    }
    return {
      pageId: String(config.pageId),
      pageAccessToken: String(config.pageAccessToken),
      formIds: Array.isArray(config.formIds) ? config.formIds.map(String) : [],
      forms: Array.isArray(config.forms) ? config.forms : undefined,
      lastPolledAt: config.lastPolledAt ? new Date(config.lastPolledAt) : undefined,
    };
  }

  /** Pulls the page's name to confirm the Page Access Token is valid and scoped correctly. */
  async testConnection(): Promise<{ success: boolean; pageName?: string; error?: string }> {
    const config = await this.getConfig();
    if (!config) {
      return { success: false, error: 'Meta Lead Ads not configured or inactive' };
    }
    try {
      const res = await fetch(
        `${META_API}/${config.pageId}?fields=id,name&access_token=${encodeURIComponent(config.pageAccessToken)}`,
      );
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: data?.error?.message || 'Connection test failed' };
      }
      return { success: true, pageName: data?.name };
    } catch (e: any) {
      this.logger.error(`Meta Lead Ads test connection error: ${e?.message}`);
      return { success: false, error: e?.message || 'Connection test failed' };
    }
  }

  /**
   * Lists (and caches on the Integration doc) the page's Lead Ads forms, so
   * the settings UI can offer a pick-list instead of raw form IDs, and so
   * lead creation can attribute a human-readable name to `Lead.source`.
   */
  async listForms(): Promise<{
    forms: Array<{ id: string; name: string; status?: string }>;
    error?: string;
  }> {
    const config = await this.getConfig();
    if (!config) {
      return { forms: [], error: 'Meta Lead Ads not configured or inactive' };
    }
    try {
      const res = await fetch(
        `${META_API}/${config.pageId}/leadgen_forms?fields=id,name,status&limit=100&access_token=${encodeURIComponent(config.pageAccessToken)}`,
      );
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { forms: [], error: data?.error?.message || 'Failed to list Lead Ads forms' };
      }
      const forms = (Array.isArray(data?.data) ? data.data : []).map((f: any) => ({
        id: String(f.id),
        name: String(f.name || ''),
        status: f.status ? String(f.status) : undefined,
      }));
      await this.integrationModel
        .updateOne({ type: 'meta-leadgen' }, { $set: { forms, formsSyncedAt: new Date() } })
        .exec();
      return { forms };
    } catch (e: any) {
      this.logger.error(`Meta Lead Ads listForms error: ${e?.message}`);
      return { forms: [], error: e?.message || 'Failed to list Lead Ads forms' };
    }
  }

  private async fetchLeadDetail(leadgenId: string, accessToken: string): Promise<any | null> {
    try {
      const url =
        `${META_API}/${leadgenId}?fields=${LEAD_DETAIL_FIELDS}` +
        `&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.error(`Meta Graph API lead fetch failed: ${JSON.stringify(data)}`);
        return null;
      }
      return data;
    } catch (e: any) {
      this.logger.error(`Meta Graph API lead fetch error: ${e?.message}`);
      return null;
    }
  }

  /** Splits a leadgen `field_data[]` array into known Lead fields vs. custom-question answers. */
  private mapFieldData(
    fieldData: Array<{ name?: string; values?: string[] }> | undefined,
  ): { known: Record<string, string>; customFields: Record<string, string> } {
    const known: Record<string, string> = {};
    const customFields: Record<string, string> = {};
    for (const f of fieldData || []) {
      const rawName = String(f?.name || '').trim();
      const value = Array.isArray(f?.values) ? String(f.values[0] ?? '').trim() : '';
      if (!rawName || !value) continue;
      const mapped = KNOWN_FIELD_KEYS[rawName.toLowerCase()];
      if (mapped) known[mapped] = value;
      else customFields[rawName] = value;
    }
    return { known, customFields };
  }

  /**
   * Shared by both ingestion paths: the webhook handler (one `detail` object
   * fetched from `/{leadgen_id}`) and the polling fallback (many `detail`
   * rows from `/{form_id}/leads`, same field shape). Dedupes by
   * `customFields.metaLeadgenId` — Meta retries webhook delivery, and the
   * poller deliberately re-scans a small overlap window — then creates the
   * Lead via the same `CRMService.createLead` path every other lead source
   * uses. Returns whether a new Lead was actually created.
   */
  private async createLeadFromDetail(
    detail: any,
    config: MetaLeadAdsConfig,
    fallbackFormId?: string,
  ): Promise<boolean> {
    const leadgenId = detail?.id ? String(detail.id) : '';
    if (!leadgenId) return false;

    const existing = await this.leadModel
      .findOne({ 'customFields.metaLeadgenId': leadgenId })
      .select('_id')
      .lean()
      .exec();
    if (existing) return false;

    const { known, customFields } = this.mapFieldData(detail.field_data);
    let firstName: string | undefined = known.firstName;
    let lastName: string | undefined = known.lastName;
    if (!firstName && known.fullName) {
      const parts = known.fullName.split(/\s+/);
      firstName = parts.shift();
      if (!lastName) lastName = parts.join(' ') || undefined;
    }
    firstName = firstName || 'Meta Lead';

    const formId = String(detail.form_id || fallbackFormId || '');
    const formName =
      config.forms?.find((f) => f.id === formId)?.name || (formId ? `Form ${formId}` : 'Lead Ads');
    const platform = String(detail.platform || '').toLowerCase();
    const pageId = String(detail.page_id || config.pageId);

    const dto: Record<string, any> = {
      firstName,
      lastName,
      email: known.email || undefined,
      phone: known.phone || undefined,
      mobileNo: known.phone || undefined,
      organization: known.organization || undefined,
      jobTitle: known.jobTitle || undefined,
      source: `Meta Lead Ads — ${formName}`,
      status: 'New',
      stage: 'New',
      sourceMetadata: {
        type: platform === 'ig' ? 'instagram' : 'facebook',
        url: `https://www.facebook.com/${pageId}`,
        title: formName,
      },
      customFields: {
        ...customFields,
        metaLeadgenId: leadgenId,
        metaFormId: formId || undefined,
        metaPageId: pageId,
        metaAdId: detail.ad_id || undefined,
        metaAdName: detail.ad_name || undefined,
        metaCampaignId: detail.campaign_id || undefined,
        metaCampaignName: detail.campaign_name || undefined,
        metaCreatedTime: detail.created_time || undefined,
      },
    };

    try {
      await this.crmService.createLead(dto);
      this.logger.log(`Created CRM lead from Meta leadgen ${leadgenId} (form: ${formName})`);
      return true;
    } catch (e: any) {
      this.logger.error(`Failed to create CRM lead from Meta leadgen ${leadgenId}: ${e?.message}`);
      return false;
    }
  }

  /**
   * Called by MetaLeadAdsWebhookController for every `leadgen` change event.
   * The webhook payload only carries the `leadgen_id`, so this fetches the
   * full lead from the Graph API before handing it to createLeadFromDetail.
   */
  async processLeadgenEvent(params: {
    leadgenId: string;
    formId?: string;
    pageId?: string;
  }): Promise<void> {
    const config = await this.getConfig();
    if (!config) {
      this.logger.warn(
        `Meta Lead Ads webhook received but integration is not configured/inactive — leadgenId=${params.leadgenId}`,
      );
      return;
    }
    if (config.formIds.length && params.formId && !config.formIds.includes(params.formId)) {
      return; // Form not on the configured allow-list — ignore.
    }

    const detail = await this.fetchLeadDetail(params.leadgenId, config.pageAccessToken);
    if (!detail) return;

    await this.createLeadFromDetail(detail, config, params.formId);
  }

  /**
   * Polling fallback for MetaLeadAdsPollingCronService — catches leads Meta
   * never got a webhook delivered for (dropped delivery, an outage window,
   * a re-subscription gap). Asks the Graph API for anything created since
   * shortly before the last successful poll (a 10-minute overlap tolerates
   * clock skew / a slow previous run; createLeadFromDetail's dedupe check
   * makes re-scanning that overlap safe) across every form on the allow-list
   * — or every form on the page, if none was configured.
   */
  async pollForNewLeads(): Promise<{ created: number; formsPolled: number; error?: string }> {
    const config = await this.getConfig();
    if (!config) return { created: 0, formsPolled: 0 };

    let formIds = config.formIds;
    if (!formIds.length) {
      const { forms, error } = await this.listForms();
      if (error) return { created: 0, formsPolled: 0, error };
      formIds = forms.map((f) => f.id);
    }
    if (!formIds.length) return { created: 0, formsPolled: 0 };

    const lookback = config.lastPolledAt
      ? new Date(config.lastPolledAt.getTime() - 10 * 60 * 1000)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sinceUnix = Math.floor(lookback.getTime() / 1000);

    let created = 0;
    for (const formId of formIds) {
      created += await this.pollForm(formId, sinceUnix, config, config.pageAccessToken);
    }

    await this.integrationModel
      .updateOne({ type: 'meta-leadgen' }, { $set: { lastPolledAt: new Date() } })
      .exec();

    return { created, formsPolled: formIds.length };
  }

  private async pollForm(
    formId: string,
    sinceUnix: number,
    config: MetaLeadAdsConfig,
    accessToken: string,
  ): Promise<number> {
    let created = 0;
    const filtering = encodeURIComponent(
      JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: String(sinceUnix) }]),
    );
    let url: string | null =
      `${META_API}/${formId}/leads?fields=${LEAD_DETAIL_FIELDS}` +
      `&filtering=${filtering}&limit=100&access_token=${encodeURIComponent(accessToken)}`;

    while (url) {
      let data: any;
      try {
        const res = await fetch(url);
        data = await res.json().catch(() => ({}));
        if (!res.ok) {
          this.logger.error(`Meta Lead Ads polling failed for form ${formId}: ${JSON.stringify(data)}`);
          break;
        }
      } catch (e: any) {
        this.logger.error(`Meta Lead Ads polling error for form ${formId}: ${e?.message}`);
        break;
      }

      for (const row of data?.data || []) {
        if (await this.createLeadFromDetail(row, config, formId)) created++;
      }
      url = data?.paging?.next ? String(data.paging.next) : null;
    }
    return created;
  }
}
