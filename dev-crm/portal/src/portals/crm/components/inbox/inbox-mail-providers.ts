import { EMAIL_PROVIDER_PRESETS } from '@/components/crm/email/deliverability/email-provider-presets';

/** Shared provider list for Connect + Edit mailbox modals (IMAP/SMTP presets). */
export const INBOX_MAIL_PROVIDERS: { id: string; name: string; hint?: string }[] = [
  { id: 'gmail', name: 'Gmail' },
  { id: 'outlook', name: 'Microsoft 365 / Outlook (work)' },
  { id: 'outlook_personal', name: 'Outlook.com / Hotmail / Live' },
  { id: 'yahoo', name: 'Yahoo Mail' },
  { id: 'zoho', name: 'Zoho Mail' },
  { id: 'zoho_eu', name: 'Zoho Mail (EU)' },
  { id: 'zoho_in', name: 'Zoho Mail (India)' },
  { id: 'godaddy', name: 'GoDaddy Email' },
  {
    id: 'hostinger',
    name: 'Hostinger Email',
    hint: 'imap.hostinger.com:993 · smtp.hostinger.com:465 (SSL)',
  },
  { id: 'ionos', name: 'IONOS / 1&1 Mail' },
  { id: 'other', name: 'Custom (other provider)' },
];

export function presetServersForProvider(providerId: string): {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
} | null {
  const cfg = EMAIL_PROVIDER_PRESETS[providerId];
  if (!cfg?.imap?.host || !cfg?.smtp?.host) return null;
  return {
    imapHost: cfg.imap.host,
    imapPort: cfg.imap.port,
    smtpHost: cfg.smtp.host,
    smtpPort: cfg.smtp.port,
    smtpSecure: cfg.smtp.port === 465,
  };
}
