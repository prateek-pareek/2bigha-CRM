const AISENSY_API_BASE =
  process.env.AISENSY_API_BASE_URL || 'https://backend.aisensy.com';

/**
 * AiSensy's "Project API" — a separate surface from the Campaign API base
 * above, hit only by `sendSessionMessage()`. Per AiSensy's Project API docs
 * (https://aisensy.stoplight.io/docs/project-api/effdec8a4894f-send-message):
 * `POST {base}/project-apis/v1/project/{projectId}/messages`, authenticated
 * via the `X-AiSensy-Project-API-Pwd` header, body shaped like Meta's own
 * Cloud API (`messaging_product`/`recipient_type`/`to`/`type`/`text.body`).
 * This is the only confirmed way to send a free-text/session WhatsApp
 * message through AiSensy — the Campaign API above is template-only.
 *
 * The `projectId` + "Project API Password" are a distinct credential pair
 * from the Campaign API key (found under AiSensy → a project's Settings →
 * API, not the account-level Manage page) — not verified end-to-end against
 * live AiSensy traffic yet, so treat send failures here as a signal to
 * double check those credentials before assuming this client is wrong.
 */
const AISENSY_PROJECT_API_BASE =
  process.env.AISENSY_PROJECT_API_BASE_URL || 'https://apis.aisensy.com';

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
 *  - Free-text/session-message sends go through a *different* AiSensy
 *    surface — the Project API (see `sendSessionMessage()` and
 *    `AISENSY_PROJECT_API_BASE` below), which needs its own `projectId` +
 *    "Project API Password" credential pair, not the Campaign API key
 *    above. Until those are configured, outbound replies to an
 *    aisensy-provider number stay template-only (see the
 *    `provider === 'aisensy'` branch in `WhatsAppService.sendMessage`).
 *  - The inbound webhook payload shape (delivery/read status, replies) is
 *    not published — `aisensy-webhook.controller.ts` logs the raw payload
 *    and does a best-effort parse so it's easy to tighten up once real
 *    traffic / AiSensy's own docs for the account are in hand.
 *
 * Revisit the last two once real AiSensy credentials are available — the
 * campaign-send call below is the one part fully confirmed against public
 * docs; `sendSessionMessage()`'s Project API shape is inferred from AiSensy's
 * Stoplight reference and not yet exercised against live traffic.
 */
export class AiSensyClient {
  constructor(
    private readonly apiKey: string,
    /** Project API credentials — only needed for `sendSessionMessage()`. */
    private readonly projectApi?: { projectId: string; projectApiPassword: string },
  ) {}

  /**
   * Sends a free-text/session WhatsApp message via AiSensy's Project API.
   * Requires `projectId`/`projectApiPassword` to have been passed to the
   * constructor (Settings → Integrations → WhatsApp → AiSensy). Unlike
   * `sendCampaignMessage`, this only works within WhatsApp's 24h customer
   * service window (i.e. the recipient must have messaged in recently) —
   * that's a WhatsApp platform rule, not an AiSensy-specific one.
   */
  async sendSessionMessage(params: {
    destination: string;
    body: string;
  }): Promise<AiSensySendResult> {
    if (!this.projectApi?.projectId || !this.projectApi?.projectApiPassword) {
      return {
        success: false,
        error:
          'AiSensy Project API credentials are not configured — add Project ID and Project API Password under Settings → Integrations → WhatsApp to enable free-text sends.',
      };
    }
    const destination = String(params.destination || '').replace(/\D/g, '');
    if (destination.length < 10) {
      return { success: false, error: 'Invalid destination phone number' };
    }
    const body = String(params.body || '').trim();
    if (!body) return { success: false, error: 'Message body is required' };

    try {
      const res = await fetch(
        `${AISENSY_PROJECT_API_BASE}/project-apis/v1/project/${encodeURIComponent(this.projectApi.projectId)}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-AiSensy-Project-API-Pwd': this.projectApi.projectApiPassword,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: destination,
            type: 'text',
            text: { body },
          }),
        },
      );

      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false || data?.error) {
        return {
          success: false,
          raw: data,
          error:
            data?.error?.message ||
            data?.message ||
            data?.error ||
            `AiSensy session send failed (HTTP ${res.status})`,
        };
      }
      return { success: true, raw: data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'AiSensy session send error' };
    }
  }

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
