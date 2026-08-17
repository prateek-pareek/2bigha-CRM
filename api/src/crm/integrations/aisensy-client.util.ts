const AISENSY_API_BASE =
  process.env.AISENSY_API_BASE_URL || 'https://backend.aisensy.com';

export type AiSensySendParams = {
  /** Digits-only destination phone number, e.g. "919876543210". */
  destination: string;
  /**
   * The Campaign name created in the AiSensy dashboard (Manage → Campaigns)
   * that this send is tied to — AiSensy's public API is campaign-scoped, not
   * template-scoped: the template must already be pre-approved and attached
   * to a named campaign before it can be triggered via API. See
   * `WhatsAppTemplate.aisensyCampaignName`.
   */
  campaignName: string;
  /** Recipient's display name — AiSensy shows this in their contact list. */
  userName?: string;
  /** Free-text attribution tag (AiSensy's `source` field), e.g. "2Bigha CRM". */
  source?: string;
  media?: { url: string; filename?: string };
  /** Values for the template's {{1}}, {{2}}... placeholders, in order. */
  templateParams?: string[];
  tags?: string[];
  attributes?: Record<string, string>;
};

export type AiSensySendResult = {
  success: boolean;
  raw?: any;
  error?: string;
};

/**
 * Thin client for AiSensy's WhatsApp Campaign API
 * (https://aisensy.com — a WhatsApp Business Solution Provider built on top
 * of Meta's Cloud API).
 *
 * Verified against AiSensy's public docs as of Aug 2026
 * (https://help.aisensy.com/en/articles/5358952-how-to-set-up-api-campaigns):
 * `POST {base}/campaign/t1/api/v2` with `{ apiKey, campaignName, destination,
 * userName, source, media, templateParams, tags, attributes }`.
 *
 * IMPORTANT — scope of what this client can actually do. AiSensy's
 * documented public API is send-only and campaign-scoped:
 *  - There is no confirmed public endpoint to create, list, or check
 *    approval status of templates programmatically — templates must be
 *    authored & approved manually in the AiSensy dashboard, then wired to a
 *    named "Campaign" there. This module only stores that mapping
 *    (`WhatsAppTemplate.aisensyCampaignName`) — see whatsapp-templates
 *    service's `linkAiSensyCampaign()`.
 *  - There is no confirmed free-text/session-message endpoint, so outbound
 *    replies to an aisensy-provider number are template-only for now (see
 *    the `provider === 'aisensy'` branch in `WhatsAppService.sendMessage`).
 *  - The inbound webhook payload shape (delivery/read status, replies) is
 *    not published — `aisensy-webhook.controller.ts` logs the raw payload
 *    and does a best-effort parse so it's easy to tighten up once real
 *    traffic / AiSensy's own docs for the account are in hand.
 *
 * Revisit all three once real AiSensy credentials are available — the send
 * call below is the one part that's confirmed correct against public docs.
 */
export class AiSensyClient {
  constructor(private readonly apiKey: string) {}

  async sendCampaignMessage(
    params: AiSensySendParams,
  ): Promise<AiSensySendResult> {
    const destination = String(params.destination || '').replace(/\D/g, '');
    if (destination.length < 10) {
      return { success: false, error: 'Invalid destination phone number' };
    }
    const campaignName = String(params.campaignName || '').trim();
    if (!campaignName) {
      return { success: false, error: 'AiSensy campaign name is required' };
    }
    if (!this.apiKey) {
      return { success: false, error: 'AiSensy API key is not configured' };
    }

    try {
      const res = await fetch(`${AISENSY_API_BASE}/campaign/t1/api/v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          campaignName,
          destination,
          userName: params.userName || destination,
          source: params.source || '2Bigha CRM',
          ...(params.media ? { media: params.media } : {}),
          ...(params.templateParams
            ? { templateParams: params.templateParams }
            : {}),
          ...(params.tags ? { tags: params.tags } : {}),
          ...(params.attributes ? { attributes: params.attributes } : {}),
        }),
      });

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        return {
          success: false,
          raw: data,
          error:
            data?.message ||
            data?.error ||
            `AiSensy send failed (HTTP ${res.status})`,
        };
      }
      return { success: true, raw: data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'AiSensy send error' };
    }
  }
}
