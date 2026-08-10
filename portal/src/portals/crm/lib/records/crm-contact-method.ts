/** True if at least one of email, phone (mobile or alternate), LinkedIn, or a portal listing URL is filled. */
export function isValidOpportunityListingUrl(raw: string | undefined): boolean {
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

export function hasPersonContactMethod(d: {
  email?: string;
  mobileNo?: string;
  phone?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
}): boolean {
  const e = String(d.email ?? '').trim();
  const m = String(d.mobileNo ?? '').trim();
  const p = String(d.phone ?? '').trim();
  const l = String(d.linkedinUrl ?? '').trim();
  const x = String(d.twitterHandle ?? '').trim();
  return e.length > 0 || m.length > 0 || p.length > 0 || l.length > 0 || x.length > 0;
}

export function hasPersonContactMethodOrPortalListing(d: {
  email?: string;
  mobileNo?: string;
  phone?: string;
  linkedinUrl?: string;
  twitterHandle?: string;
  opportunityListingUrl?: string;
}): boolean {
  if (hasPersonContactMethod(d)) return true;
  return isValidOpportunityListingUrl(d.opportunityListingUrl);
}
