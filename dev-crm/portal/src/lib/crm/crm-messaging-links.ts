/**
 * Build WhatsApp / Telegram web URLs from CRM contact fields.
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

/** Deal: use linked contact or populated lead phone fields. */
export function dealWhatsappUrl(deal: {
  contactPerson?: unknown;
  lead?: unknown;
}): string | null {
  const cp = deal.contactPerson;
  if (cp && typeof cp === 'object' && cp !== null) {
    const u = contactWhatsappUrl(cp as { mobileNo?: string; phone?: string });
    if (u) return u;
  }
  const ld = deal.lead;
  if (ld && typeof ld === 'object' && ld !== null) {
    const u = contactWhatsappUrl(ld as { mobileNo?: string; phone?: string });
    if (u) return u;
  }
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
