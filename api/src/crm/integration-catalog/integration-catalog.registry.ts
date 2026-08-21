export type CatalogAuthType = 'oauth' | 'api_key' | 'webhook' | 'manual';
export type CatalogCategory =
  | 'communication'
  | 'email'
  | 'productivity'
  | 'payments'
  | 'analytics'
  | 'automation';

export type CatalogAvailability = 'live' | 'coming_soon';

export interface IntegrationCatalogDefinition {
  id: string;
  name: string;
  description: string;
  category: CatalogCategory;
  authType: CatalogAuthType;
  /** Relative portal path to configure / OAuth start. */
  configurePath: string;
  /** Docs or vendor URL (optional). */
  docsUrl?: string;
  /** Brand accent for UI icon chip. */
  accentColor: string;
  availability: CatalogAvailability;
  /** How we detect an existing install in Mongo. */
  statusQuery?: {
    type?: string;
    name?: string;
  };
  capabilities: string[];
}

/**
 * Single source of truth for the CRM integrations marketplace.
 * Phase 1: live apps use existing connect flows via configurePath.
 * Phase 2+: add provider adapters and flip availability to `live`.
 */
export const INTEGRATION_CATALOG: IntegrationCatalogDefinition[] = [
  {
    id: 'microsoft-teams',
    name: 'Microsoft Teams',
    description:
      'Broadcast CRM updates, deal closures, and new leads to Teams channels via webhooks. Bot DMs power workflow Notify actions.',
    category: 'communication',
    authType: 'webhook',
    configurePath: '/crm/settings/integrations#microsoft-teams',
    accentColor: '#4B53BC',
    availability: 'live',
    statusQuery: { name: 'Microsoft Teams' },
    capabilities: ['channel_notifications', 'workflow_dm'],
  },
  {
    id: 'whatsapp-business',
    name: 'WhatsApp Business',
    description:
      'Send automated updates and engage customers on WhatsApp via the Meta Cloud API.',
    category: 'communication',
    authType: 'api_key',
    configurePath: '/crm/settings/integrations/whatsapp',
    accentColor: '#25D366',
    availability: 'live',
    statusQuery: { type: 'whatsapp' },
    capabilities: ['outbound_messages', 'webhooks'],
  },
  {
    id: 'meta-lead-ads',
    name: 'Meta Lead Ads',
    description:
      'Automatically create CRM leads the moment someone submits a Facebook or Instagram Lead Ads form, via Meta webhooks.',
    category: 'automation',
    authType: 'api_key',
    configurePath: '/crm/settings/integrations/meta-leads',
    accentColor: '#0866FF',
    availability: 'live',
    statusQuery: { type: 'meta-leadgen' },
    capabilities: ['lead_capture', 'webhooks'],
  },
  {
    id: 'google-postmaster',
    name: 'Google Postmaster Tools',
    description:
      'Monitor domain reputation, spam rates, and delivery errors from Google.',
    category: 'email',
    authType: 'oauth',
    configurePath: '/crm/settings/integrations/postmaster',
    accentColor: '#4285F4',
    availability: 'live',
    statusQuery: { type: 'google_postmaster' },
    capabilities: ['domain_reputation', 'spam_metrics'],
  },
  {
    id: 'email-intelligence',
    name: 'Email intelligence',
    description:
      'LinkedIn finder and email verification with Tomba, Prospeo, Clearout, Hunter, and failover.',
    category: 'email',
    authType: 'api_key',
    configurePath: '/crm/settings/integrations/email-intelligence',
    accentColor: '#0EA5E9',
    availability: 'live',
    statusQuery: { type: 'email-intelligence' },
    capabilities: ['email_finder', 'email_verify', 'failover'],
  },
  {
    id: 'voice-calling',
    name: 'Voice calling',
    description:
      'Call leads from CRM via Twilio (click-to-call), Readymode outbound dialer, or ElevenLabs AI agents. Choose the active provider in settings.',
    category: 'communication',
    authType: 'api_key',
    configurePath: '/crm/settings/integrations/voice',
    docsUrl: 'https://readymode.com',
    accentColor: '#10B981',
    availability: 'live',
    statusQuery: { type: 'voice-calling' },
    capabilities: ['outbound_calls', 'click_to_call', 'ai_voice_agent'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description:
      'Push CRM reminders, deal updates, and lead alerts to Slack channels through Incoming Webhooks.',
    category: 'communication',
    authType: 'webhook',
    configurePath: '/crm/settings/integrations#slack',
    accentColor: '#4A154B',
    availability: 'live',
    statusQuery: { name: 'Slack' },
    capabilities: ['channel_notifications', 'calendar_reminders'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description:
      'Sync invoices and payment status from Stripe into CRM deals and clients.',
    category: 'payments',
    authType: 'oauth',
    configurePath: '/crm/settings/integrations',
    accentColor: '#635BFF',
    availability: 'coming_soon',
    capabilities: ['payments', 'invoices', 'webhooks'],
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description:
      'Create Zoom meetings from deals and log call outcomes automatically.',
    category: 'productivity',
    authType: 'oauth',
    configurePath: '/crm/settings/integrations',
    accentColor: '#2D8CFF',
    availability: 'coming_soon',
    capabilities: ['meetings', 'recordings'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description:
      'Sync playbooks and deal notes with Notion workspaces.',
    category: 'productivity',
    authType: 'oauth',
    configurePath: '/crm/settings/integrations',
    accentColor: '#000000',
    availability: 'coming_soon',
    capabilities: ['notes_sync', 'databases'],
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description:
      'Create CRM activities when prospects book meetings via Calendly.',
    category: 'productivity',
    authType: 'oauth',
    configurePath: '/crm/settings/integrations',
    accentColor: '#006BFF',
    availability: 'coming_soon',
    capabilities: ['scheduling', 'activity_sync'],
  },
  {
    id: 'custom-webhook',
    name: 'Custom webhook',
    description:
      'Send CRM events to Zapier, Make, n8n, or any HTTPS endpoint.',
    category: 'automation',
    authType: 'webhook',
    configurePath: '/crm/settings/integrations',
    accentColor: '#F97316',
    availability: 'coming_soon',
    capabilities: ['outbound_events'],
  },
];

export function getCatalogDefinition(
  id: string,
): IntegrationCatalogDefinition | undefined {
  return INTEGRATION_CATALOG.find((item) => item.id === id);
}
