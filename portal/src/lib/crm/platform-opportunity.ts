export {
  CRM_OPPORTUNITY_SOURCE_PLATFORMS,
  CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS,
  CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION,
  mergeOpportunitySourcePlatforms,
  resolveOpportunitySourcePlatform,
} from '@/lib/crm/crm-opportunity-portal-options';

export const PLATFORM_ENGAGEMENT_STATUSES = [
  { value: 'saved', label: 'Saved (not applied yet)' },
  { value: 'applied', label: 'Applied' },
  { value: 'messaged', label: 'Messaged client' },
  { value: 'interview', label: 'Interview / call' },
  { value: 'hired', label: 'Hired / won' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'no_response', label: 'No response' },
] as const;

export type PlatformEngagementStatus =
  (typeof PLATFORM_ENGAGEMENT_STATUSES)[number]['value'];

export function platformEngagementLabel(
  value: string | undefined | null,
): string {
  const v = String(value ?? '').trim();
  if (!v) return '—';
  return (
    PLATFORM_ENGAGEMENT_STATUSES.find((s) => s.value === v)?.label ?? v
  );
}

/** LinkedIn, Meta Threads, or Facebook post URLs (same as CRM leads). */
export function isCrmSocialPostUrl(url?: string | null): boolean {
  const u = String(url ?? '').trim();
  if (!u) return false;
  return (
    u.includes('linkedin.com') ||
    u.includes('threads.com') ||
    u.includes('threads.net') ||
    u.includes('facebook.com') ||
    u.includes('fb.watch')
  );
}

export function normalizeSocialPostUrlInput(raw: string): string {
  let val = raw.trim();
  const iframeSrc = val.match(/src=["']([^"']+)["']/);
  if (iframeSrc) val = iframeSrc[1];
  return val;
}

export function hasValidPlatformLeadIdentity(d: {
  opportunitySourcePlatform?: string;
  opportunityListingUrl?: string;
  platformClientLabel?: string;
}): boolean {
  const platform = String(d.opportunitySourcePlatform ?? '').trim();
  if (!platform) return false;
  const client = String(d.platformClientLabel ?? '').trim();
  if (client.length >= 2) return true;
  const url = String(d.opportunityListingUrl ?? '').trim();
  if (url.length < 12 || !/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    return Boolean(u.hostname && u.hostname.includes('.'));
  } catch {
    return false;
  }
}
