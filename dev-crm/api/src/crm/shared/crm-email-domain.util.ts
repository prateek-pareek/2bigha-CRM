/**
 * Corporate email-domain → company linking helpers.
 * Public / consumer domains are skipped so personal Gmail etc. never become companies.
 */

/** Consumer / free / public mailbox hosts — never auto-create a company for these. */
export const PUBLIC_EMAIL_DOMAINS = new Set(
  [
    // Google
    'gmail.com',
    'googlemail.com',
    'google.com',
    // Microsoft
    'outlook.com',
    'outlook.in',
    'hotmail.com',
    'hotmail.co.uk',
    'hotmail.in',
    'live.com',
    'live.in',
    'msn.com',
    'passport.com',
    // Yahoo
    'yahoo.com',
    'yahoo.co.in',
    'yahoo.co.uk',
    'ymail.com',
    'rocketmail.com',
    // Apple
    'icloud.com',
    'me.com',
    'mac.com',
    // Zoho consumer
    'zoho.com',
    'zoho.in',
    'zohomail.com',
    'zohomail.in',
    // Others
    'aol.com',
    'protonmail.com',
    'proton.me',
    'pm.me',
    'mail.com',
    'email.com',
    'gmx.com',
    'gmx.net',
    'gmx.de',
    'web.de',
    'rediffmail.com',
    'inbox.com',
    'fastmail.com',
    'tutanota.com',
    'tutamail.com',
    'yandex.com',
    'yandex.ru',
    'mail.ru',
    'qq.com',
    '163.com',
    '126.com',
    'sina.com',
    'hey.com',
    'duck.com',
    'privaterelay.appleid.com',
  ].map((d) => d.toLowerCase()),
);

export function extractEmailDomain(
  email: string | null | undefined,
): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 0 || at === trimmed.length - 1) return null;
  const domain = trimmed
    .slice(at + 1)
    .replace(/^\.+|\.+$/g, '')
    .replace(/^www\./, '');
  if (!domain || !domain.includes('.') || /\s/.test(domain)) return null;
  return domain;
}

export function isPublicEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return true;
  const d = domain.trim().toLowerCase();
  if (PUBLIC_EMAIL_DOMAINS.has(d)) return true;
  // Also skip very common multi-level public hosts
  for (const pub of PUBLIC_EMAIL_DOMAINS) {
    if (d === pub || d.endsWith(`.${pub}`)) return true;
  }
  return false;
}

/** Whether this email should drive auto company creation / association. */
export function isCorporateEmailDomain(
  emailOrDomain: string | null | undefined,
): boolean {
  const domain = emailOrDomain?.includes('@')
    ? extractEmailDomain(emailOrDomain)
    : emailOrDomain?.trim().toLowerCase() || null;
  if (!domain) return false;
  return !isPublicEmailDomain(domain);
}

/** Human company label from domain, e.g. acme.co.in → Acme */
export function companyNameFromDomain(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  // Drop common TLDs / ccTLDs for the label
  const tlds = new Set([
    'com',
    'org',
    'net',
    'io',
    'co',
    'ai',
    'app',
    'dev',
    'in',
    'uk',
    'us',
    'au',
    'ca',
    'de',
    'fr',
    'jp',
    'cn',
    'info',
    'biz',
    'edu',
    'gov',
  ]);
  let label = parts[0] || host;
  if (parts.length >= 3 && tlds.has(parts[parts.length - 1]) && tlds.has(parts[parts.length - 2])) {
    label = parts[parts.length - 3];
  } else if (parts.length >= 2) {
    label = parts[parts.length - 2];
  }
  if (!label) return host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Canonical website value stored on Organization.website */
export function websiteFromDomain(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, '');
  return `https://${host}`;
}

/** Normalize website / domain strings for matching. */
export function normalizeDomainKey(value: string | null | undefined): string | null {
  if (!value) return null;
  let s = String(value).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0].replace(/\.+$/, '');
  if (!s || !s.includes('.')) return null;
  return s;
}

/** Common website string variants for a host (used in org $or lookups). */
export function websiteMatchVariants(domain: string): string[] {
  const key = normalizeDomainKey(domain);
  if (!key) return [];
  return [
    key,
    `http://${key}`,
    `https://${key}`,
    `www.${key}`,
    `http://www.${key}`,
    `https://www.${key}`,
  ];
}

/**
 * Mongo filter that finds an Organization already representing this domain
 * (customFields.email_domain, website variants, or exact derived name).
 */
export function organizationDomainMatchFilter(
  domain: string,
): Record<string, unknown> | null {
  const key = normalizeDomainKey(domain);
  if (!key) return null;
  const websites = websiteMatchVariants(key);
  const name = companyNameFromDomain(key);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    $or: [
      { 'customFields.email_domain': key },
      { website: { $in: websites } },
      { name: new RegExp(`^${escaped}$`, 'i') },
    ],
  };
}
