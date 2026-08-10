/**
 * Default IMAP/SMTP for CRM “Connect email” UI when GET /crm/inbox-accounts/providers
 * is unavailable. Keep host/port values aligned with
 * `api-hrms/src/crm/inbox-accounts.service.ts` → PROVIDER_CONFIGS.
 */
export type ProviderServerPreset = {
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
};

export const EMAIL_PROVIDER_PRESETS: Record<string, ProviderServerPreset> = {
  gmail: {
    imap: { host: "imap.gmail.com", port: 993 },
    smtp: { host: "smtp.gmail.com", port: 587 },
  },
  outlook: {
    imap: { host: "outlook.office365.com", port: 993 },
    smtp: { host: "smtp.office365.com", port: 587 },
  },
  outlook_personal: {
    imap: { host: "imap-mail.outlook.com", port: 993 },
    smtp: { host: "smtp-mail.outlook.com", port: 587 },
  },
  yahoo: {
    imap: { host: "imap.mail.yahoo.com", port: 993 },
    smtp: { host: "smtp.mail.yahoo.com", port: 587 },
  },
  zoho: {
    imap: { host: "imap.zoho.com", port: 993 },
    smtp: { host: "smtp.zoho.com", port: 587 },
  },
  zoho_eu: {
    imap: { host: "imap.zoho.eu", port: 993 },
    smtp: { host: "smtp.zoho.eu", port: 587 },
  },
  /** Zoho Mail — India (zoho.in); matches Zoho control panel IMAP/SMTP. */
  zoho_in: {
    imap: { host: "imap.zoho.in", port: 993 },
    smtp: { host: "smtp.zoho.in", port: 465 },
  },
  godaddy: {
    imap: { host: "imap.secureserver.net", port: 993 },
    smtp: { host: "smtpout.secureserver.net", port: 465 },
  },
  /** Hostinger hPanel: IMAP 993, SMTP 465 (SSL/TLS) */
  hostinger: {
    imap: { host: "imap.hostinger.com", port: 993 },
    smtp: { host: "smtp.hostinger.com", port: 465 },
  },
  ionos: {
    imap: { host: "imap.ionos.com", port: 993 },
    smtp: { host: "smtp.ionos.com", port: 465 },
  },
};
