/**
 * Build WhatsApp / Telegram / LinkedIn web URLs from CRM contact fields.
 */

export function digitsForMessaging(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits;
}

/** Opens WhatsApp Web / app via wa.me (international digits, no +). */
export function whatsappUrlFromPhone(phone: string | undefined | null): string | null {
  const d = digitsForMessaging(phone);
  if (!d) return null;
  return `https://wa.me/${d}`;
}

export function contactWhatsappUrl(contact: { mobileNo?: string; phone?: string }): string | null {
  return whatsappUrlFromPhone(contact.mobileNo) || whatsappUrlFromPhone(contact.phone);
}

/** Digits-only WhatsApp id for a contact, for routing within the CRM (e.g. `/crm/whatsapp?wa=...`)
 *  rather than opening an external wa.me link. */
export function contactWhatsappWaId(contact: { mobileNo?: string; phone?: string }): string | null {
  return digitsForMessaging(contact.mobileNo) || digitsForMessaging(contact.phone);
}

/** Ensure a CRM-stored URL opens in the browser. */
export function normalizeExternalHttpUrl(raw: string | undefined | null): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^\/\//.test(t)) return `https:${t}`;
  // LinkedIn profile handles: "in/username", "/in/username", "username" under linkedin context
  if (/^(in|company|school)\//i.test(t)) return `https://www.linkedin.com/${t.replace(/^\/+/, '')}`;
  if (/^linkedin\.com\//i.test(t)) return `https://www.${t}`;
  return `https://${t.replace(/^\/+/, '')}`;
}

function isLinkedInHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'linkedin.com' || host.endsWith('.linkedin.com');
  } catch {
    return /linkedin\.com/i.test(url);
  }
}

function readCustomFieldString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const cf = record.customFields as
    | Map<string, unknown>
    | Record<string, unknown>
    | undefined;
  if (!cf) return undefined;
  const map =
    typeof (cf as Map<string, unknown>).get === 'function'
      ? Object.fromEntries(cf as Map<string, unknown>)
      : { ...(cf as Record<string, unknown>) };
  for (const k of keys) {
    const v = map[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Lead/contact LinkedIn profile URL from `linkedinUrl` or common custom-field aliases.
 */
export function contactLinkedInProfileUrl(record: {
  linkedinUrl?: string;
  linkedInUrl?: string;
  linkedin?: string;
  customFields?: unknown;
  [key: string]: unknown;
}): string | null {
  const direct =
    String(record.linkedinUrl || '').trim() ||
    String(record.linkedInUrl || '').trim() ||
    String(record.linkedin || '').trim() ||
    readCustomFieldString(record as Record<string, unknown>, [
      'linkedinUrl',
      'linkedInUrl',
      'linkedin',
      'LinkedIn',
      'LinkedIn URL',
      'linkedin_url',
      'linkedinProfile',
      'linkedin_profile',
    ]);
  return normalizeExternalHttpUrl(direct || null);
}

/**
 * LinkedIn source / post URL from `source` or `sourceMetadata`
 * (e.g. shared LinkedIn post used when the lead was captured).
 */
export function contactLinkedInSourceUrl(record: {
  source?: string;
  sourceMetadata?: { url?: string; type?: string } | null;
}): string | null {
  const meta = record.sourceMetadata;
  if (meta && typeof meta === 'object') {
    const metaUrl = normalizeExternalHttpUrl(meta.url);
    if (metaUrl && (meta.type === 'linkedin' || isLinkedInHost(metaUrl))) {
      return metaUrl;
    }
  }
  const src = String(record.source || '').trim();
  if (!src) return null;
  const href = normalizeExternalHttpUrl(src);
  if (href && isLinkedInHost(href)) return href;
  return null;
}

function customFieldsAsRecord(contact: Record<string, unknown>): Record<string, string> {
  const cf = contact.customFields as Map<string, string> | Record<string, string> | undefined;
  if (!cf) return {};
  if (typeof (cf as Map<string, string>).get === 'function') {
    return Object.fromEntries(cf as Map<string, string>);
  }
  return { ...(cf as Record<string, string>) };
}

/** Telegram username, phone, or full URL from standard or common custom field keys. */
export function getTelegramRaw(contact: Record<string, unknown>): string | undefined {
  const direct = contact.telegram;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const map = customFieldsAsRecord(contact);
  for (const k of ['telegram', 'Telegram', 'telegramUsername']) {
    const v = map[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Resolves @handle, t.me URL, https URL, or international phone digits to a t.me link. */
export function telegramUrlFromRaw(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const cleaned = t.replace(/^https?:\/\//i, '');
  if (/^t\.me\//i.test(cleaned)) return `https://${cleaned}`;
  const rest = t.replace(/^@/, '').trim();
  const onlyDigits = rest.replace(/\D/g, '');
  if (onlyDigits.length >= 8 && /^[\d+()\s-]+$/.test(rest)) {
    const d = digitsForMessaging(rest);
    return d ? `https://t.me/+${d}` : null;
  }
  if (!rest) return null;
  return `https://t.me/${rest}`;
}

export function contactTelegramUrl(contact: Record<string, unknown>): string | null {
  const raw = getTelegramRaw(contact);
  if (!raw) return null;
  return telegramUrlFromRaw(raw);
}
