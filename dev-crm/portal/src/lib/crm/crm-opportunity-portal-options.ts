/** Lead capture when the prospect comes from a public marketplace or job board (no direct email yet). */
export const CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS = [
  'Upwork',
  'Fiverr',
  'Freelancer.com',
  'LinkedIn Jobs',
  'Indeed',
  'Glassdoor',
  'AngelList / Wellfound',
  'Naukri',
  'Foundit (Monster India)',
  'PeoplePerHour',
  'Guru',
  'Toptal',
] as const;

/** Sentinel in dropdowns — user enters a one-off name in a text field. */
export const CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION = 'Other / custom';

/** @deprecated Use hook/API merged list; kept for static fallbacks. */
export const CRM_OPPORTUNITY_SOURCE_PLATFORMS = [
  ...CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS,
  CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION,
] as const;

export function normalizeOpportunityPlatformName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function mergeOpportunitySourcePlatforms(
  custom: string[] = [],
  extra: string[] = [],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const name = normalizeOpportunityPlatformName(raw);
    if (!name || name === CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const p of CRM_BUILTIN_OPPORTUNITY_SOURCE_PLATFORMS) push(p);
  for (const p of custom) push(p);
  for (const p of extra) push(p);
  out.push(CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION);
  return out;
}

export function resolveOpportunitySourcePlatform(
  selected: string,
  customName: string,
): string {
  const sel = normalizeOpportunityPlatformName(selected);
  if (sel === CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION) {
    return normalizeOpportunityPlatformName(customName);
  }
  return sel;
}

export function isCustomOpportunityPlatformSelection(value: string): boolean {
  return normalizeOpportunityPlatformName(value) === CRM_OPPORTUNITY_CUSTOM_PLATFORM_OPTION;
}
