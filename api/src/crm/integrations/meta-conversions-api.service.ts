import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Integration } from './schemas/integration.schema';

const META_API = 'https://graph.facebook.com/v26.0';

type CapiConfig = {
  pixelId: string;
  accessToken: string;
  eventDataSetId?: string;
};

/**
 * Sends server-side conversion events to Meta's Conversions API (CAPI) after
 * a lead is created from Meta Lead Ads. This lets Meta attribute the lead back
 * to the specific ad/campaign that generated it, improving ad optimization.
 *
 * Payload follows the structure shared by the client — fires only for
 * Meta-originated leads (`action_source: "system_generated"`).
 */
@Injectable()
export class MetaConversionsApiService {
  private readonly logger = new Logger(MetaConversionsApiService.name);

  constructor(
    @InjectModel(Integration.name, 'crmConnection')
    private readonly integrationModel: Model<any>,
  ) {}

  /**
   * Reads CAPI config from the `type: 'meta-leadgen'` Integration doc.
   * Returns null if CAPI is not configured/enabled.
   */
  private async getCapiConfig(): Promise<CapiConfig | null> {
    const doc = await this.integrationModel
      .findOne({ type: 'meta-leadgen' })
      .lean()
      .exec();

    if (!doc?.capiEnabled || !doc?.pixelId) return null;

    const accessToken = doc.capiAccessToken || doc.pageAccessToken;
    if (!accessToken) return null;

    return {
      pixelId: String(doc.pixelId),
      accessToken: String(accessToken),
      eventDataSetId: doc.eventDataSetId ? String(doc.eventDataSetId) : undefined,
    };
  }

  /** SHA-256 hash a value — Meta requires all PII to be lowercase + hashed. */
  private sha256(value: string): string {
    return crypto
      .createHash('sha256')
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  /**
   * Sends a "Lead" conversion event to Meta CAPI. Called fire-and-forget
   * from MetaLeadAdsService after a lead is successfully created.
   *
   * @param metaLeadId  The Meta Leadgen ID (used as `lead_id` + `event_id`)
   * @param email       Raw email (will be SHA-256 hashed before sending)
   * @param phone       Raw phone (will be SHA-256 hashed before sending)
   */
  async sendLeadEvent(params: {
    metaLeadId: string;
    email?: string;
    phone?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const config = await this.getCapiConfig();
    if (!config) return { success: false, error: 'CAPI not configured or disabled' };

    const userData: Record<string, any> = {};

    // Meta requires lead_id as a number when available
    const leadIdNum = Number(params.metaLeadId);
    if (!isNaN(leadIdNum)) {
      userData.lead_id = leadIdNum;
    }

    if (params.email) {
      userData.em = [this.sha256(params.email)];
    }
    if (params.phone) {
      // Normalize phone: strip spaces/dashes, keep leading +
      const normalized = params.phone.replace(/[\s\-()]/g, '');
      userData.ph = [this.sha256(normalized)];
    }

    const eventPayload = {
      data: [
        {
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: params.metaLeadId, // Idempotency key — safe for retries
          action_source: 'system_generated',
          user_data: userData,
          custom_data: {
            event_source: 'crm',
            lead_event_source: '2Bigha CRM',
          },
        },
      ],
    };

    const url =
      `${META_API}/${config.pixelId}/events` +
      `?access_token=${encodeURIComponent(config.accessToken)}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
      });
      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data?.error?.message || `HTTP ${res.status}`;
        this.logger.warn(`CAPI event skipped for leadgen ${params.metaLeadId}: ${errMsg}`);
        return { success: false, error: errMsg };
      }

      this.logger.log(
        `CAPI Lead event sent for leadgen ${params.metaLeadId} — ` +
          `events_received: ${data?.events_received ?? '?'}`,
      );
      return { success: true };
    } catch (e: any) {
      this.logger.warn(`CAPI event error for leadgen ${params.metaLeadId}: ${e?.message}`);
      return { success: false, error: e?.message || 'Network error' };
    }
  }

  /**
   * Test endpoint — sends a test event to verify CAPI credentials are valid.
   * Uses `test_event_code` so the event shows in Meta Events Manager's
   * test section without polluting real data.
   */
  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    const config = await this.getCapiConfig();
    if (!config) {
      return { success: false, error: 'CAPI not configured — set Pixel ID and access token, then enable' };
    }

    const testPayload = {
      data: [
        {
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: `test_${Date.now()}`,
          action_source: 'system_generated',
          user_data: {
            em: [this.sha256('test@example.com')],
          },
          custom_data: {
            event_source: 'crm',
            lead_event_source: '2Bigha CRM',
          },
        },
      ],
      test_event_code: 'TEST_CRM', // Shows in Events Manager test tab
    };

    const url =
      `${META_API}/${config.pixelId}/events` +
      `?access_token=${encodeURIComponent(config.accessToken)}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
      }
      return {
        success: true,
        message: `CAPI test event sent to Pixel ${config.pixelId} — events_received: ${data?.events_received ?? '?'}`,
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }
}
