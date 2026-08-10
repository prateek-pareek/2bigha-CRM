/** Normalize for duplicate checks across CRM leads + contacts. */

export function normalizeEmail(email: string | undefined | null): string {
  if (email == null) return '';
  return String(email).trim().toLowerCase();
}

/** Digits only — compare phone identity across formats. */
export function normalizePhoneDigits(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s).replace(/\D/g, '');
}

export function normalizeLinkedInUrl(s: string | undefined | null): string {
  if (s == null) return '';
  let t = String(s).trim();
  if (!t) return '';
  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`;
  }
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.includes('linkedin.com')) return '';
    const path = `${u.pathname}${u.search}`.replace(/\/+$/, '').toLowerCase();
    return `https://${host}${path}`;
  } catch {
    return '';
  }
}

/** Path key for /in/username — used for tolerant matching. */
export function linkedInProfileKey(s: string | undefined | null): string {
  const n = normalizeLinkedInUrl(s);
  if (!n) return '';
  const m = n.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : '';
}

export function hasAtLeastOneContactMethod(d: {
  email?: unknown;
  mobileNo?: unknown;
  phone?: unknown;
  linkedinUrl?: unknown;
  twitterHandle?: unknown;
}): boolean {
  const e = normalizeEmail(d.email as string);
  const m = normalizePhoneDigits(d.mobileNo as string);
  const p = normalizePhoneDigits(d.phone as string);
  const l = String(d.linkedinUrl ?? '').trim();
  const li = linkedInProfileKey(d.linkedinUrl as string);
  const x = String(d.twitterHandle ?? '').trim();
  return (
    e.length > 0 ||
    m.length > 0 ||
    p.length > 0 ||
    l.length > 0 ||
    li.length > 0 ||
    x.length > 0
  );
}

/** True if `raw` looks like an absolute http(s) URL with a hostname (job board / project link). */
export function isValidOpportunityListingUrl(raw: unknown): boolean {
  const s = String(raw ?? '').trim();
  if (s.length < 12) return false;
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return Boolean(u.hostname && u.hostname.includes('.'));
  } catch {
    return false;
  }
}

/** Lead identity: classic contact methods OR a portal listing URL (no email yet). */
export function hasAtLeastOneContactOrPortalListing(d: {
  email?: unknown;
  mobileNo?: unknown;
  phone?: unknown;
  linkedinUrl?: unknown;
  twitterHandle?: unknown;
  opportunityListingUrl?: unknown;
}): boolean {
  if (hasAtLeastOneContactMethod(d)) return true;
  return isValidOpportunityListingUrl(d.opportunityListingUrl);
}

export function isPlatformLeadType(leadType: unknown): boolean {
  return String(leadType ?? '').trim().toLowerCase() === 'platform';
}

/** Platform module: marketplace + listing URL or client label (no email/phone required). */
export function hasValidPlatformLeadIdentity(d: {
  opportunitySourcePlatform?: unknown;
  opportunityListingUrl?: unknown;
  platformClientLabel?: unknown;
}): boolean {
  const platform = String(d.opportunitySourcePlatform ?? '').trim();
  if (!platform) return false;
  const client = String(d.platformClientLabel ?? '').trim();
  if (client.length >= 2) return true;
  return isValidOpportunityListingUrl(d.opportunityListingUrl);
}

export function displayName(first?: string, last?: string): string {
  const n = [first, last]
    .filter((x) => x && String(x).trim())
    .join(' ')
    .trim();
  return n || 'Unnamed';
}
