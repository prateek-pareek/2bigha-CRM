const AISENSY_API_BASE =
  process.env.AISENSY_API_BASE_URL || 'https://backend.aisensy.com';

const AISENSY_PROJECT_API_BASE =
  process.env.AISENSY_PROJECT_API_BASE_URL || 'https://apis.aisensy.com';

export type AiSensySendParams = {
  /** Digits-only destination phone number, e.g. "919876543210". */
  destination: string;
  campaignName: string;
  userName?: string;
  source?: string;
  media?: { url: string; filename?: string };
  mediaType?: 'image' | 'document' | 'video' | 'audio';
  templateParams?: string[];
  tags?: string[];
  attributes?: Record<string, string>;
  /** Optional standard Meta components if sending via Project API */
  components?: any[];
  language?: string;
};

export type AiSensySendResult = {
  success: boolean;
  raw?: any;
  error?: string;
};

export class AiSensyClient {
  constructor(
    private readonly apiKey: string,
    /** Project API credentials — enables direct Project API sends */
    private readonly projectApi?: { projectId: string; projectApiPassword: string },
  ) {}

  /**
   * Sends a message (template, session text, or document) via AiSensy's Project API.
   */
  async sendProjectMessage(payload: any): Promise<AiSensySendResult> {
    if (!this.projectApi?.projectId || !this.projectApi?.projectApiPassword) {
      return {
        success: false,
        error: 'AiSensy Project ID and Password are not configured under Settings → Integrations → WhatsApp',
      };
    }

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
          body: JSON.stringify(payload),
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
            `AiSensy send failed (HTTP ${res.status})`,
        };
      }
      return { success: true, raw: data };
    } catch (e: any) {
      return { success: false, error: e?.message || 'AiSensy Project API send error' };
    }
  }

  /**
   * Sends a free-text/session WhatsApp message via AiSensy's Project API.
   */
  async sendSessionMessage(params: {
    destination: string;
    body: string;
  }): Promise<AiSensySendResult> {
    const destination = String(params.destination || '').replace(/\D/g, '');
    if (destination.length < 10) {
      return { success: false, error: 'Invalid destination phone number' };
    }
    const body = String(params.body || '').trim();
    if (!body) return { success: false, error: 'Message body is required' };

    return this.sendProjectMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: destination,
      type: 'text',
      text: { body },
    });
  }

  /**
   * Sends a pre-approved template via AiSensy Project API or legacy Campaign API.
   */
  async sendCampaignMessage(
    params: AiSensySendParams,
  ): Promise<AiSensySendResult> {
    const destination = String(params.destination || '').replace(/\D/g, '');
    if (destination.length < 10) {
      return { success: false, error: 'Invalid destination phone number' };
    }
    const templateOrCampaignName = String(params.campaignName || '').trim();
    if (!templateOrCampaignName) {
      return { success: false, error: 'Template/Campaign name is required' };
    }

    // Preferred Route: Direct Project API (official, active, handles all templates)
    if (this.projectApi?.projectId && this.projectApi?.projectApiPassword) {
      const templatePayload: any = {
        name: templateOrCampaignName,
        language: { code: params.language || 'en' },
      };

      if (Array.isArray(params.components) && params.components.length > 0) {
        templatePayload.components = params.components;
      } else if (Array.isArray(params.templateParams) && params.templateParams.length > 0) {
        templatePayload.components = [
          {
            type: 'body',
            parameters: params.templateParams.map((text) => ({
              type: 'text',
              text: String(text || ''),
            })),
          },
        ];
      }

      if (params.media?.url) {
        if (!templatePayload.components) templatePayload.components = [];
        const isPdf = params.media.url.toLowerCase().includes('.pdf') || (params.media.filename || '').toLowerCase().endsWith('.pdf');
        const mediaType = params.mediaType || (isPdf ? 'document' : 'image');

        templatePayload.components.unshift({
          type: 'header',
          parameters: [
            {
              type: mediaType,
              [mediaType]: {
                link: params.media.url,
                ...(mediaType === 'document' ? { filename: params.media.filename || 'Property-Brochure.pdf' } : {}),
              },
            },
          ],
        });
      }

      return this.sendProjectMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: destination,
        type: 'template',
        template: templatePayload,
      });
    }

    // Fallback: Legacy Campaign API
    if (!this.apiKey) {
      return { success: false, error: 'AiSensy API key is not configured' };
    }

    try {
      const res = await fetch(`${AISENSY_API_BASE}/campaign/t1/api/v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          campaignName: templateOrCampaignName,
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

  /**
   * Sends a document (e.g. PDF brochure) directly via AiSensy Project API.
   */
  async sendDocumentMessage(params: {
    destination: string;
    url: string;
    filename?: string;
    caption?: string;
  }): Promise<AiSensySendResult> {
    const destination = String(params.destination || '').replace(/\D/g, '');
    if (destination.length < 10) {
      return { success: false, error: 'Invalid destination phone number' };
    }

    return this.sendProjectMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: destination,
      type: 'document',
      document: {
        link: params.url,
        filename: params.filename || 'Property-Brochure.pdf',
        ...(params.caption ? { caption: params.caption } : {}),
      },
    });
  }
}
